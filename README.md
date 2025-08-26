**📘 StudyMate - Server Side**

The StudyMate Server is the backend for the StudyMate platform, built with Node.js, Express.js, and MongoDB.
It handles authentication, user roles (student/tutor/admin), study sessions, booked sessions, payments, study materials, notes, and reviews.

** Features**

**🔑 Authentication**

JWT-based authentication.

Tokens stored in HTTP-only cookies.

Firebase authentication integrated on client side.
**
👨‍🎓 Student**

Register/Login (default role = student).

Book study sessions (free/paid).

View booked sessions.

Access study materials of booked sessions.

Create and manage personal notes:

Add, edit, delete notes.

**👨‍🏫 Tutor**

Apply to become a tutor (application stored in DB).

Admin reviews request → Approve/Reject.

Tutor Dashboard:

Create study sessions (title, description, dates, fee, duration, etc.).

View own sessions (approved/rejected).

Reapply rejected sessions.

Update or delete created sessions.

Upload study materials (Google Drive links & images) for specific sessions.

**🛡️ Admin**

Login with admin credentials:

Email: walid@gmal.com

Password: Asdfgh


**Admin Dashboard:**

View all users, search by email.

Change user roles (student ↔ tutor ↔ admin).

Review tutor applications (approve/reject).

Manage all study sessions:

Approve, reject (with reason), update, delete.

Review uploaded study materials:

Delete inappropriate materials.


**💳 Payment Integration**

Stripe Payment Gateway integrated.

Create payment intent → confirm with client → save in DB.

Book session only after successful payment.


**🛠️ Technologies Used**

Node.js - Runtime

Express.js - Web framework

MongoDB - Database

jsonwebtoken (JWT) - Auth

cookie-parser - Cookie handling

cors - Cross-origin requests

dotenv - Env variables

Stripe - Payment API

**⚙️ Installation & Setup**

**1️⃣ Clone Repository**

git clone https://github.com/md-arifur-rahman09/study-mate-server

cd studymate-server

**2️⃣ Install Dependencies**

npm install

**3️⃣ Setup Environment Variables**

Create a .env file in root:

PORT=5000

DB_USER=studyMateAdmin

DB_PASS=pfKKIEmkgWvU2cxg

JWT_SECRET=ded0a5a08962d327df49c03564ac2d79a4cbdd799476c5f602d64b8efb28464bc5632e4240535534b2cfd9d68ef04242f10eb27c11acd9e80ecf1839751ba3d9


**4️⃣ Run the Server**

npm start

**📂 Project Structure**

server/

│── index.js        # Main entry file

│── .env            # Environment variables

│── package.json    # Dependencies


**🔗 API Endpoints**

**🔑 Auth**

POST /jwt → Generate JWT & store in cookie

POST /logout → Clear JWT cookie

**👨‍🎓 Student**

GET /booked-sessions/:email → Get booked sessions

POST /booked-sessions → Book session

GET /notes/:email → Get notes

POST /notes → Add note

PUT /notes/:id → Update note

DELETE /notes/:id → Delete note

**👨‍🏫 Tutor**

POST /tutor-requests → Apply for tutor role

GET /my-study-sessions?email= → Tutor’s own sessions

POST /study-sessions → Create new session

PATCH /study-sessions/:id → Update session

DELETE /study-sessions/:id → Delete session

PATCH /study-sessions/reapply/:id → Reapply rejected session

POST /materials → Upload materials (drive link/image)

GET /material?tutorEmail= → Get tutor’s uploaded materials

**🛡️ Admin**

GET /users → Get all users

PATCH /users/role/:id → Update user role

GET /tutor-requests → Get tutor applications

PATCH /tutor-requests/:id → Approve/Reject tutor

GET /study-sessions → Get all study sessions

PATCH /study-sessions/approve/:id → Approve session

PATCH /study-sessions/reject/:id → Reject session

DELETE /study-sessions/:id → Delete session

GET /materials → Get all study materials

DELETE /materials/:id → Delete material

**💳 Payments**

POST /create-payment-intent → Stripe payment intent

POST /payments → Save payment info

GET /payments?email= → Get payment history

**⭐ Reviews**

POST /reviews → Add review

GET /reviews/:sessionId → Get reviews for session

**👨‍💻 Default Admin Access**

**To log in as admin:**

Email: walid@gmal.com

Password: Asdfgh

