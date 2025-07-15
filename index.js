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
        const tutorsCollection = client.db("studyMateDB").collection("tutors");
        const sessionsCollection = client.db("studyMateDB").collection("studySessions");
        const rejectedSessionsCollection = client.db("studyMateDB").collection("rejectedSessions");


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



        // /................................tutor.......................
        // tutors api
        app.get("/tutor-requests", async (req, res) => {
            const status = req.query.status || "pending";
            try {
                const requests = await tutorsCollection
                    .find({ status })
                    .toArray();
                res.send(requests);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch requests" });
            }
        });


        // approved tutors list
        app.get("/approved-tutors", async (req, res) => {
            const tutors = await tutorsCollection
                .find({ status: "approved" })
                .toArray();
            res.send(tutors);
        });




        // POST: apply for tutor
        app.post("/tutor-requests", async (req, res) => {
            try {
                const requestData = req.body;

                // Check if already applied
                const existing = await tutorsCollection.findOne({ email: requestData.email });

                if (existing) {
                    return res.status(409).send({ message: "You have already applied" });
                }

                // Default status: pending
                requestData.status = "pending";
                requestData.appliedAt = new Date().toISOString();

                const result = await tutorsCollection.insertOne(requestData);
                res.status(201).send(result);

            } catch (error) {
                console.error("Tutor Apply Error:", error.message);
                res.status(500).send({ message: "Failed to submit application", error: error.message });
            }
        });


        app.patch('/tutor-deactivate/:id', async (req, res) => {
            const id = req.params.id;

            try {
                // Step 1: Update tutor status to "deactivated"
                const result = await tutorsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            status: "deactivated",
                            updatedAt: new Date().toISOString(),
                        },
                    }
                );

                // Step 2: Remove tutor role from users collection
                const tutor = await tutorsCollection.findOne({ _id: new ObjectId(id) });
                if (tutor?.email) {
                    await usersCollection.updateOne(
                        { email: tutor.email },
                        { $set: { role: "student" } } // fallback to student
                    );
                }

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Failed to deactivate tutor" });
            }
        });


        app.patch("/tutor-requests/:id", async (req, res) => {
            const id = req.params.id;
            const { status } = req.body;

            try {
                // Step 1: Update the request status
                const result = await tutorsCollection.updateOne(
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
                    const request = await tutorsCollection.findOne({ _id: new ObjectId(id) });

                    if (request?.email) {
                        await usersCollection.updateOne(
                            { email: request.email },
                            { $set: { role: "tutor" } }
                        );
                    }
                }

                res.send(result);
            } catch (error) {
                console.error(error); // Debugging
                res.status(500).send({ error: "Failed to update status" });
            }
        });

        // session api
        // Get all approved & rejected sessions by tutor email
        app.get("/my-study-sessions", async (req, res) => {
            try {
                const email = req.query.email;
                const filter = {
                    tutorEmail: email,
                    status: { $in: ["approved", "rejected"] },
                };

                const sessions = await sessionsCollection.find(filter).toArray();
                res.send(sessions);
            } catch (error) {
                res.status(500).send({ error: "Failed to load sessions" });
            }
        });

        // POST: Create a new study session
        app.post("/study-sessions", async (req, res) => {
            try {
                const sessionData = req.body;

                // Basic validation (tutor name, email, title check)
                if (!sessionData?.tutorEmail || !sessionData?.title) {
                    return res.status(400).send({ error: "Missing required fields" });
                }

                // Optional: prevent duplicate session titles for same tutor
                const duplicate = await sessionsCollection.findOne({
                    title: sessionData.title,
                    tutorEmail: sessionData.tutorEmail,
                });
                if (duplicate) {
                    return res.status(409).send({ error: "Session with this title already exists" });
                }

                const result = await sessionsCollection.insertOne(sessionData);
                res.status(201).send(result);
            } catch (err) {
                console.error("Error creating session:", err.message);
                res.status(500).send({ error: "Failed to create study session" });
            }
        });

        // PATCH: update study session
        app.patch("/study-sessions/:id", async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await sessionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    {
                        $set: {
                            title: updatedData.title,
                            description: updatedData.description,
                            registrationStart: updatedData.registrationStart,
                            registrationEnd: updatedData.registrationEnd,
                            classStart: updatedData.classStart,
                            classEnd: updatedData.classEnd,
                            duration: updatedData.duration,
                            registrationFee: parseInt(updatedData.registrationFee),
                            updatedAt: new Date().toISOString()
                        }
                    }
                );

                res.send(result);
            } catch (error) {
                console.error("Update failed:", error);
                res.status(500).send({ error: "Failed to update session" });
            }
        });



        // Reapply rejected session (change status to pending)
        app.patch("/study-sessions/reapply/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const result = await sessionsCollection.updateOne(
                    { _id: new ObjectId(id), status: "rejected" },
                    {
                        $set: {
                            status: "pending",
                            reappliedAt: new Date().toISOString(), // optional tracking
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to reapply session" });
            }
        });



        // .....................................................................
        // GET: All sessions (admin only)
        app.get('/study-sessions', async (req, res) => {
            const result = await sessionsCollection.find().toArray();
            res.send(result);
        });

        // POST: reject a session with reason and feedback
        app.post("/rejected-sessions", async (req, res) => {
            try {
                const rejectionData = req.body;
                rejectionData.rejectedAt = new Date().toISOString();

                const result = await rejectedSessionsCollection.insertOne(rejectionData);

                // Update studySession status to "rejected"
                await studySessionsCollection.updateOne(
                    { _id: new ObjectId(rejectionData.sessionId) },
                    { $set: { status: "rejected" } }
                );

                res.send({ success: true, insertedId: result.insertedId });
            } catch (error) {
                res.status(500).send({ error: "Failed to save rejection reason" });
            }
        });


        // PATCH: Approve session (set fee)
        app.patch('/study-sessions/approve/:id', async (req, res) => {
            const id = req.params.id;
            const { registrationFee } = req.body;
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: "approved",
                        registrationFee: Number(registrationFee),
                        updatedAt: new Date().toISOString()
                    }
                }
            );
            res.send(result);
        });

        // PATCH: Reject session
        // study-sessions/reject/:id   
        app.patch('/study-sessions/reject/:id', async (req, res) => {
            const id = req.params.id;
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(id) },
                {
                    $set: {
                        status: "rejected",
                        updatedAt: new Date().toISOString()
                    }
                }
            );
            res.send(result);
        });

        // DELETE: Session
        app.delete('/study-sessions/:id', async (req, res) => {
            const id = req.params.id;
            const result = await sessionsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
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
