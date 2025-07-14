require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middlewares
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// verify token
const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) return res.status(401).send({ error: "Unauthorized" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).send({ error: "Invalid token" });
        req.user = decoded;
        next();
    });
};


// verify admin
// isAdmin middleware
const verifyAdmin = async (req, res, next) => {
    const email = req.user?.email; // decoded from JWT
    const user = await usersCollection.findOne({ email });

    if (user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
    }

    next();
};




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n1yvnuo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();


        const usersCollection = client.db("studyMateDB").collection("users");
        const instructorsCollection = client.db("studyMateDB").collection("instructors");


        // JWT Generate & Send via Cookie
        app.post("/jwt", async (req, res) => {
            const user = req.body;

            const token = jwt.sign(user, process.env.JWT_SECRET, {
                expiresIn: "7d",
            });

            res
                .cookie("token", token, {
                    httpOnly: true,
                    secure: false, // production এ true করো


                })
                .send({ success: true });
        });




        // Save user after register/social login
        app.post("/users", async (req, res) => {
            try {
                const user = req.body;
                const query = { email: user.email };
                const existing = await usersCollection.findOne(query);

                if (existing) {
                    const updatedDoc = {
                        $set: { lastLogin: new Date().toISOString() }
                    };
                    await usersCollection.updateOne({ email: user.email }, updatedDoc);
                    return res.status(200).send({ message: "User already exists" });
                }
                // Default role: student 🚩
                user.role = user.role || "student";

                const result = await usersCollection.insertOne(user);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to save user" });
            }
        });



        // GET: /users/role/:email
        app.get("/users/role/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            try {
                const user = await usersCollection.findOne(query);

                if (!user) {
                    return res.status(404).send({ message: "User not found", role: null });
                }

                res.send({ role: user.role });
            } catch (error) {
                res.status(500).send({ message: "Server error", error: error.message });
            }
        });

        // GET: User full info
        app.get("/users/details/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            if (!user) {
                return res.status(404).send({ message: "User not found" });
            }
            res.send(user);
        });



        // /................................instructor.......................
        // instructors api
        app.get("/instructor-requests", async (req, res) => {
            const status = req.query.status || "pending";
            try {
                const requests = await instructorsCollection
                    .find({ status })
                    .toArray();
                res.send(requests);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch requests" });
            }
        });


        // approved instructors list
        app.get("/approved-instructors", async (req, res) => {
            const instructors = await instructorsCollection
                .find({ status: "approved" })
                .toArray();
            res.send(instructors);
        });




        // POST: apply for instructor
        app.post("/instructor-requests", async (req, res) => {
            try {
                const requestData = req.body;

                // Check if already applied
                const existing = await instructorsCollection.findOne({ email: requestData.email });

                if (existing) {
                    return res.status(409).send({ message: "You have already applied" });
                }

                // Default status: pending
                requestData.status = "pending";
                requestData.appliedAt = new Date().toISOString();

                const result = await instructorsCollection.insertOne(requestData);
                res.status(201).send(result);

            } catch (error) {
                console.error("Instructor Apply Error:", error.message);
                res.status(500).send({ message: "Failed to submit application", error: error.message });
            }
        });


        app.patch('/instructor-deactivate/:id', async (req, res) => {
            const id = req.params.id;

            try {
                // Step 1: Update instructor status to "deactivated"
                const result = await instructorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status: "deactivated",
                            updatedAt: new Date().toISOString(),
                        },
                    }
                );

                // Step 2: Remove instructor role from users collection
                const instructor = await instructorsCollection.findOne({ _id: new ObjectId(id) });
                if (instructor?.email) {
                    await usersCollection.updateOne(
                        { email: instructor.email },
                        { $set: { role: "student" } } // fallback to student
                    );
                }

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Failed to deactivate instructor" });
            }
        });


        app.patch("/instructor-requests/:id", async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;

            try {
                // Step 1: Update the request status
                const result = await instructorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status: status,
                            updatedAt: new Date().toISOString(),
                        },
                    }
                );

                // Step 2: If approved, update user role
                if (status === "approved") {
                    const request = await instructorsCollection.findOne({ _id: new ObjectId(id) });

                    if (request?.email) {
                        await usersCollection.updateOne(
                            { email: request.email },
                            { $set: { role: "instructor" } }
                        );
                    }
                }

                res.send(result);
            } catch (error) {
                console.error(error); // Debugging
                res.status(500).send({ error: "Failed to update status" });
            }
        });



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Routes
app.get('/', (req, res) => {
    res.send('StudyMate server running');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
// Y6cT7PtMVVlWuMX6