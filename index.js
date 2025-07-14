require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require('mongodb');

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

        const db = client.db("studyMateDB");
        usersCollection = db.collection("users");


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


        // check if admin
        app.get("/users/admin/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send( user?.role === "admin" );
        });

        // check if instructor
        app.get("/users/instructor/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send({ instructor: user?.role === "instructor" });
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