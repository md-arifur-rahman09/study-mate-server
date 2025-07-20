require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const token = req.cookies?.token;
    if (!token) return res.status(401).send({ error: "Unauthorized" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).send({ error: "Invalid token" });
        req.user = decoded;

        next();
    });
};

// verify email 
const verifyEmail = (req, res, next) => {
    if (req.params.email !== req.user.email) {
        return res.status(403).send({ message: "forbidden access" });
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
        const bookedSessionsCollection = client.db("studyMateDB").collection("bookedSessions")
        const reviewsCollection = client.db("studyMateDB").collection("reviews");
        const notesCollection = client.db("studyMateDB").collection('notes')
        const materialsCollection = client.db("studyMateDB").collection("materials");
        const paymentsCollection = client.db('studyMateDB').collection('payments');

        // verify admin
        // isAdmin middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.user?.email; // decoded from JWT
            console.log("verify admin email", email)
            const user = await usersCollection.findOne({ email });

            if (user?.role !== "admin") {
                return res.status(403).send({ message: "Forbidden access" });
            }

            next();
        };

        // verifyTutor
        const verifyTutor = async (req, res, next) => {
            const email = req.user?.email; // decoded from JWT
            const user = await usersCollection.findOne({ email });

            if (user?.role !== "tutor") {
                return res.status(403).send({ message: "Forbidden access" });
            }

            next();
        };
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

        // stripe payment
        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body;
            const price = parseInt(amount * 100); // Convert to cents

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: price,
                    currency: "usd",
                    payment_method_types: ["card"],
                });

                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });


        // get payment history by email query
        // app.get('/payments', async (req, res) => {
        //     const email = req.query.email;
        //     const query = { email: email };

        //     const result = await paymentsCollection.find(query).toArray();
        //     res.send(result);
        // })


        // payment post + update

        app.post('/payments', async (req, res) => {
            const paymentData = req.body;
            const result = await paymentsCollection.insertOne(paymentData);
            res.send(result);
        })
        // app.post('/payments', async (req, res) => {
        //     const paymentData = req.body;
        //     const parcelId = paymentData.id;

        //     // Step 1: Save to paymentsCollection
        //     const paymentResult = await paymentsCollection.insertOne(paymentData);

        //     // Step 2: Update parcelsCollection's payment_status to "paid"
        //     const filter = { _id: new ObjectId(parcelId) };
        //     const updateDoc = {
        //         $set: {
        //             payment_status: 'paid'
        //         }
        //     };
        //     const parcelUpdateResult = await parcelsCollection.updateOne(filter, updateDoc);

        //     res.send(
        //         paymentResult,

        //     );

        // });



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





        // GET: User full info
        app.get("/users/details/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            if (!user) {
                return res.status(404).send({ message: "User not found" });
            }
            res.send(user);
        });

        // GET all users
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const users = await usersCollection.find().toArray();
                res.send(users);
            } catch (error) {
                res.status(500).send({ error: "Failed to get users" });
            }
        });


        // PATCH role update
        app.patch("/users/role/:id", async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role: role } }
                );
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to update role" });
            }
        });


        // /................................tutor.......................

        // GET: /tutors?status=approved
        app.get("/tutors", async (req, res) => {
            const status = req.query.status;
            try {
                const query = status ? { status } : {};
                const result = await tutorsCollection.find(query).toArray(); // use `tutorsCollection` if renamed
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch tutors" });
            }
        });

        // tutors api
        app.get("/tutor-requests", verifyToken, verifyAdmin, async (req, res) => {
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
        app.get("/approved-tutors", verifyToken, verifyAdmin, async (req, res) => {
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
        app.get("/my-study-sessions",verifyToken,verifyTutor, async (req, res) => {
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

        });

        // PATCH: update study session
        app.patch("/study-sessions/:id", async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;


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
        app.get('/study-sessions', verifyToken, verifyAdmin, async (req, res) => {
            const result = await sessionsCollection.find().toArray();
            res.send(result);
        });




        // GET: Approved Study Sessions
        app.get("/study-sessions/approved", async (req, res) => {

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 18;
            const skip = (page - 1) * limit;

            const total = await sessionsCollection.countDocuments({ status: "approved" });
            const sessions = await sessionsCollection
                .find({ status: "approved" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();

            res.send({ sessions, total });

        });

        app.get("/study-session/approved", async (req, res) => {

            const result = await sessionsCollection.find({ status: "approved" }).sort({ createdAt: -1 }).toArray();
            res.send(result)
        })

        app.get('/study-session/approved',verifyToken,verifyTutor,async (req, res) => {
            const email = req.query.tutorEmail;
            const query = {
                tutorEmail: email,
                status: "approved"
            };

            const result = await sessionsCollection.find(query).toArray();
            res.send(result);
        });

        // Backend: inside your Express `run` function






        // user role check
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            const user = await usersCollection.findOne(query);

            res.send({ role: user.role });
        });

        // check student email & sessionId
        app.get("/booked-sessions/check", async (req, res) => {
            const { studentEmail, sessionId } = req.query;

            const exists = await bookedSessionsCollection.findOne({
                studentEmail,
                sessionId,
            });

            res.send(exists);
        });



        app.get("/study-sessions/:id", async (req, res) => {
            const id = req.params.id;
            const session = await sessionsCollection.findOne({ _id: new ObjectId(id) });
            res.send(session);
        });


        // app.get('/booked-sessions/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { sessionId: id }
        //     const result = await bookedSessionsCollection.findOne(query);
        //     res.send(result);
        // })





        // POST: reject a session with reason and feedback
        app.post("/rejected-sessions", async (req, res) => {
            try {
                const rejectionData = req.body;
                rejectionData.rejectedAt = new Date().toISOString();

                const result = await rejectedSessionsCollection.insertOne(rejectionData);

                // Update studySession status to "rejected"
                await sessionsCollection.updateOne(
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
        // booked session api
        // POST: /booked-sessions
        app.post("/booked-sessions", async (req, res) => {
            const booking = req.body;

            const exists = await bookedSessionsCollection.findOne({
                sessionId: booking.sessionId,
                studentEmail: booking.studentEmail,
            });

            if (exists) {
                // এখানেই সমস্যা ছিল! এটা ঠিক করুন নিচের মত:
                return res.status(400).send({
                    success: false,
                    message: "already booked"
                });
            }

            const result = await bookedSessionsCollection.insertOne(booking);
            res.send({ success: true, insertedId: result.insertedId });
        });





        // GET all booked sessions for a student
        app.get("/booked-sessions/:email", verifyToken, verifyEmail, async (req, res) => {
            const email = req.params.email;
            try {
                const sessions = await bookedSessionsCollection.find({ studentEmail: email }).toArray();
                res.send(sessions);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch booked sessions" });
            }
        });
        // GET all materials for a specific study session
        app.get("/materials/session/:sessionId", async (req, res) => {
            const sessionId = req.params.sessionId;
            try {
                const materials = await materialsCollection.find({ sessionId }).toArray();
                res.send(materials);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch materials" });
            }
        });

        // Example endpoint: check if a session is already booked by this student




        app.get("/booked-sessions/user/:email", verifyToken, verifyEmail, async (req, res) => {
            const email = req.params.email;

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 12;
            const skip = (page - 1) * limit;

            const total = await bookedSessionsCollection.countDocuments({ studentEmail: email });
            const result = await bookedSessionsCollection
                .find({ studentEmail: email })
                .skip(skip)
                .limit(limit)
                .toArray();

            res.send({ data: result, total });
        });



        // ...................................................................review 
        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        app.get('/reviews/:sessionId', async (req, res) => {
            const sessionId = req.params.sessionId;
            const reviews = await reviewsCollection.find({ sessionId }).toArray();
            res.send(reviews);
        });

        // ..........................................................................  notes 
        // POST a new note
        app.post('/notes', async (req, res) => {
            const note = req.body;
            note.createdAt = new Date();
            note.updatedAt = new Date();
            note.status = "active";

            const result = await notesCollection.insertOne(note);
            res.send(result);
        });

        // GET all notes for a student
        app.get('/notes/:email', verifyToken, verifyEmail, async (req, res) => {
            const { email } = req.params;
            const notes = await notesCollection.find({ email }).toArray();
            res.send(notes);
        });


        // PUT /notes/:id
        app.put('/notes/:id', async (req, res) => {
            const id = req.params.id;
            const { title, description } = req.body;
            const updateDoc = {
                $set: {
                    title,
                    description,
                    updatedAt: new Date()
                }
            };
            const result = await notesCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
            res.send(result);
        });


        // DELETE /notes/:id
        app.delete('/notes/:id', async (req, res) => {
            const id = req.params.id;
            const result = await notesCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // ...........................................................................................materials collection
        // Method: GET
        // URL: /materials

        app.get("/materials", verifyToken, verifyAdmin, async (req, res) => {
            const result = await materialsCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        // POST: Upload Material
        app.post('/materials', async (req, res) => {
            const material = req.body;
            const result = await materialsCollection.insertOne(material);
            res.send({ success: result.insertedId ? true : false });
        });

        app.get('/material', verifyToken, verifyTutor, async (req, res) => {
            const { tutorEmail } = req.query;
            if (!tutorEmail) {
                return res.status(400).send({ error: 'Tutor email is required' });
            }

            const result = await materialsCollection.find({ tutorEmail }).toArray();
            res.send(result);
        });

        // delete materials
        app.delete('/materials/:id', async (req, res) => {
            const id = req.params.id;
            const result = await materialsCollection.deleteOne({ _id: new ObjectId(id) });

            if (result.deletedCount) {
                res.send({ success: true });
            } else {
                res.status(404).send({ success: false, message: 'Material not found' });
            }
        });




        // update materials
        app.patch('/materials/:id', async (req, res) => {
            const id = req.params.id;
            const { title, driveLink, imageUrl } = req.body;

            const updateDoc = {
                $set: {
                    title,
                    driveLink,
                    imageUrl,
                    updatedAt: new Date().toISOString(),
                },
            };

            const result = await materialsCollection.updateOne(
                { _id: new ObjectId(id) },
                updateDoc
            );

            if (result.modifiedCount) {
                res.send({ success: true });
            } else {
                res.status(404).send({ success: false, message: 'Material not updated' });
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
