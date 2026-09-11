
/*
============================================================
GUARDIAN SOS BACKEND
============================================================

Technology:
- Node.js
- Express
- MongoDB / Mongoose
- JWT authentication
- bcrypt password hashing
- CORS
- Helmet security headers
- dotenv environment variables

This server provides:

1. User registration
2. User login
3. User authentication
4. Emergency contacts
5. SOS events
6. GPS location storage
7. Emergency history
8. User profile
9. Logout support
10. Frontend serving

IMPORTANT:
Never put MONGO_URI or JWT_SECRET inside frontend files.
Keep them inside .env.
============================================================
*/


/* ============================================================
   IMPORT PACKAGES
============================================================ */

require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const AfricasTalking = require("africastalking");


/* ============================================================
   CREATE EXPRESS APP
============================================================ */

const app = express();


/* ============================================================
   BASIC CONFIGURATION
============================================================ */

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
    console.error("ERROR: JWT_SECRET is missing from .env");
    process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

    const africasTalking =
    AfricasTalking({
        apiKey: process.env.AT_API_KEY,
        username: process.env.AT_USERNAME
    });

const sms =
    africasTalking.SMS;


/* ============================================================
   SECURITY
============================================================ */

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);


/* ============================================================
   CORS
============================================================ */

app.use(
    cors({
        origin: true,
        credentials: true
    })
);


/* ============================================================
   BODY PARSER
============================================================ */

app.use(
    express.json({
        limit: "1mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "1mb"
    })
);


/* ============================================================
   SERVE FRONTEND
============================================================ */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/* ============================================================
   DATABASE SCHEMAS
============================================================ */


/*
------------------------------------------------------------
USER SCHEMA
------------------------------------------------------------
*/

const UserSchema = new mongoose.Schema(

    {

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 150
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 30
        },

        password: {
            type: String,
            required: true
        },

        createdAt: {
            type: Date,
            default: Date.now
        }

    }

);


/*
------------------------------------------------------------
EMERGENCY CONTACT SCHEMA
------------------------------------------------------------
*/

const EmergencyContactSchema = new mongoose.Schema(

    {

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        phone: {
            type: String,
            required: true,
            trim: true,
            maxlength: 30
        },

        relationship: {
            type: String,
            trim: true,
            maxlength: 50
        },

        priority: {
            type: Number,
            default: 1
        },

        createdAt: {
            type: Date,
            default: Date.now
        }

    }

);


/*
------------------------------------------------------------
SOS EVENT SCHEMA
------------------------------------------------------------
*/

const SOSEventSchema = new mongoose.Schema(

    {

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        status: {
            type: String,

            enum: [
                "ACTIVE",
                "CANCELLED",
                "RESOLVED"
            ],

            default: "ACTIVE"
        },

        latitude: {
            type: Number,
            default: null
        },

        longitude: {
            type: Number,
            default: null
        },

        accuracy: {
            type: Number,
            default: null
        },

        message: {
            type: String,
            maxlength: 1000
        },

        createdAt: {
            type: Date,
            default: Date.now
        },

        resolvedAt: {
            type: Date,
            default: null
        }

    }

);


/*
------------------------------------------------------------
LOCATION SCHEMA
------------------------------------------------------------
*/

const LocationSchema = new mongoose.Schema(

    {

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        latitude: {
            type: Number,
            required: true
        },

        longitude: {
            type: Number,
            required: true
        },

        accuracy: {
            type: Number,
            default: null
        },

        timestamp: {
            type: Date,
            default: Date.now
        }

    }

);


/* ============================================================
   CREATE MODELS
============================================================ */

const User =
    mongoose.model(
        "User",
        UserSchema
    );


const EmergencyContact =
    mongoose.model(
        "EmergencyContact",
        EmergencyContactSchema
    );


const SOSEvent =
    mongoose.model(
        "SOSEvent",
        SOSEventSchema
    );


const Location =
    mongoose.model(
        "Location",
        LocationSchema
    );


/* ============================================================
   MONGODB CONNECTION
============================================================ */

if (!process.env.MONGO_URI) {

    console.error(
        "ERROR: MONGO_URI is missing from .env"
    );

} else {

    mongoose
        .connect(process.env.MONGO_URI)

        .then(() => {

            console.log(
                "MongoDB connected successfully."
            );

        })

        .catch((error) => {

            console.error(
                "MongoDB connection error:",
                error.message
            );

        });

}


/* ============================================================
   HELPER FUNCTIONS
============================================================ */


/*
------------------------------------------------------------
CREATE JWT
------------------------------------------------------------
*/

function createToken(user) {

    return jwt.sign(

        {
            userId: user._id.toString(),

            email: user.email

        },

        JWT_SECRET,

        {
            expiresIn: "7d"
        }

    );

}


/*
------------------------------------------------------------
AUTHENTICATION MIDDLEWARE
------------------------------------------------------------
*/

function authenticateToken(req, res, next) {

    const authorization =
        req.headers.authorization;


    if (!authorization) {

        return res.status(401).json({

            success: false,

            message:
                "Authentication required."

        });

    }


    const parts =
        authorization.split(" ");


    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {

        return res.status(401).json({

            success: false,

            message:
                "Invalid authentication format."

        });

    }


    const token = parts[1];


    try {

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );


        req.user = decoded;


        next();


    } catch (error) {

        return res.status(401).json({

            success: false,

            message:
                "Invalid or expired token."

        });

    }

}


/*
------------------------------------------------------------
VALIDATE EMAIL
------------------------------------------------------------
*/

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}


/*
------------------------------------------------------------
VALIDATE COORDINATES
------------------------------------------------------------
*/

function validCoordinates(
    latitude,
    longitude
) {

    if (
        typeof latitude !== "number" ||
        typeof longitude !== "number"
    ) {

        return false;

    }


    if (
        latitude < -90 ||
        latitude > 90
    ) {

        return false;

    }


    if (
        longitude < -180 ||
        longitude > 180
    ) {

        return false;

    }


    return true;

}

/*
------------------------------------------------------------
SEND SOS SMS
------------------------------------------------------------
*/

async function sendSOSAlerts(
    user,
    contacts,
    emergency
) {

    if (
        !process.env.AT_API_KEY ||
        !process.env.AT_USERNAME
    ) {

        console.error(
            "Africa's Talking SMS credentials are missing."
        );

        return {
            success: false,
            message: "SMS service is not configured."
        };

    }


    if (
        !contacts ||
        contacts.length === 0
    ) {

        return {
            success: false,
            message:
                "No emergency contacts found."
        };

    }


    let locationText =
        "Location unavailable.";


    if (
        emergency.latitude !== null &&
        emergency.longitude !== null
    ) {

        locationText =
            `https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`;

    }


    const message =
        `🚨 GUARDIAN SOS ALERT 🚨\n\n` +
        `${user.name} has activated an emergency SOS.\n\n` +
        `Phone: ${user.phone || "Not provided"}\n` +
        `Location: ${locationText}\n\n` +
        `Please contact or assist them immediately.`;


    const phoneNumbers =
    contacts
        .map(contact => String(contact.phone).trim())
        .filter(phone => phone.length > 0);


    if (phoneNumbers.length === 0) {

        return {
            success: false,
            message:
                "Emergency contacts do not have valid phone numbers."
        };

    }


    try {

        const result =
    await sms.send({

        to: phoneNumbers.join(","),

        message:
            message

    });


        console.log(
            "SOS SMS sent:",
            JSON.stringify(
                result,
                null,
                2
            )
        );


        return {

            success: true,

            message:
                "SOS alerts sent successfully.",

            recipients:
                phoneNumbers

        };


    } catch (error) {

        console.error(
            "SOS SMS error:",
            error
        );


        return {

            success: false,

            message:
                error.message ||
                "Unable to send SOS SMS."

        };

    }

}



/* ============================================================
   BASIC ROUTES
============================================================ */


/*
------------------------------------------------------------
HOME
------------------------------------------------------------
*/

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});


/*
------------------------------------------------------------
API STATUS
------------------------------------------------------------
*/

app.get("/api/status", (req, res) => {

    res.json({

        success: true,

        application:
            "Guardian SOS",

        status:
            "online",

        time:
            new Date().toISOString()

    });

});


/* ============================================================
   AUTHENTICATION
============================================================ */


/*
------------------------------------------------------------
REGISTER
------------------------------------------------------------
POST /api/auth/register
------------------------------------------------------------
*/

app.post(
    "/api/auth/register",
    async (req, res) => {

        try {

            const {
                name,
                email,
                phone,
                password
            } = req.body;


            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Name, email and password are required."

                });

            }


            if (!isValidEmail(email)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a valid email address."

                });

            }


            if (password.length < 8) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must contain at least 8 characters."

                });

            }


            const normalizedEmail =
                email.toLowerCase().trim();


            const existingUser =
                await User.findOne({
                    email: normalizedEmail
                });


            if (existingUser) {

                return res.status(409).json({

                    success: false,

                    message:
                        "An account with this email already exists."

                });

            }


            const hashedPassword =
                await bcrypt.hash(
                    password,
                    12
                );


            const user =
                await User.create({

                    name:
                        name.trim(),

                    email:
                        normalizedEmail,

                    phone:
                        phone
                            ? phone.trim()
                            : "",

                    password:
                        hashedPassword

                });


            const token =
                createToken(user);


            res.status(201).json({

                success: true,

                message:
                    "Account created successfully.",

                token,

                user: {

                    id:
                        user._id,

                    name:
                        user.name,

                    email:
                        user.email,

                    phone:
                        user.phone

                }

            });


        } catch (error) {

            console.error(
                "Registration error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to create account."

            });

        }

    }
);


/*
------------------------------------------------------------
LOGIN
------------------------------------------------------------
POST /api/auth/login
------------------------------------------------------------
*/

app.post(
    "/api/auth/login",
    async (req, res) => {

        try {

            const {
                email,
                password
            } = req.body;


            if (
                !email ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Email and password are required."

                });

            }


            const user =
                await User.findOne({

                    email:
                        email
                            .toLowerCase()
                            .trim()

                });


            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }


            const passwordMatches =
                await bcrypt.compare(
                    password,
                    user.password
                );


            if (!passwordMatches) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid email or password."

                });

            }


            const token =
                createToken(user);


            res.json({

                success: true,

                message:
                    "Login successful.",

                token,

                user: {

                    id:
                        user._id,

                    name:
                        user.name,

                    email:
                        user.email,

                    phone:
                        user.phone

                }

            });


        } catch (error) {

            console.error(
                "Login error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to login."

            });

        }

    }
);


/*
------------------------------------------------------------
VERIFY CURRENT USER
------------------------------------------------------------
GET /api/auth/me
------------------------------------------------------------
*/

app.get(
    "/api/auth/me",
    authenticateToken,
    async (req, res) => {

        try {

            const user =
                await User.findById(
                    req.user.userId
                ).select("-password");


            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }


            res.json({

                success: true,

                user

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve user."

            });

        }

    }
);


/* ============================================================
   EMERGENCY CONTACTS
============================================================ */


/*
------------------------------------------------------------
ADD EMERGENCY CONTACT
------------------------------------------------------------
POST /api/contacts
------------------------------------------------------------
*/

app.post(
    "/api/contacts",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                name,
                phone,
                relationship,
                priority
            } = req.body;


            if (
                !name ||
                !phone
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Contact name and phone are required."

                });

            }


            const contact =
                await EmergencyContact.create({

                    userId:
                        req.user.userId,

                    name:
                        name.trim(),

                    phone:
                        phone.trim(),

                    relationship:
                        relationship
                            ? relationship.trim()
                            : "",

                    priority:
                        Number(priority) || 1

                });


            res.status(201).json({

                success: true,

                message:
                    "Emergency contact saved.",

                contact

            });


        } catch (error) {

            console.error(
                "Contact creation error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to save emergency contact."

            });

        }

    }
);


/*
------------------------------------------------------------
GET EMERGENCY CONTACTS
------------------------------------------------------------
GET /api/contacts
------------------------------------------------------------
*/

app.get(
    "/api/contacts",
    authenticateToken,
    async (req, res) => {

        try {

            const contacts =
                await EmergencyContact
                    .find({
                        userId:
                            req.user.userId
                    })
                    .sort({
                        priority: 1,
                        createdAt: 1
                    });


            res.json({

                success: true,

                contacts

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve contacts."

            });

        }

    }
);


/*
------------------------------------------------------------
DELETE EMERGENCY CONTACT
------------------------------------------------------------
DELETE /api/contacts/:id
------------------------------------------------------------
*/

app.delete(
    "/api/contacts/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const contact =
                await EmergencyContact.findOneAndDelete({

                    _id:
                        req.params.id,

                    userId:
                        req.user.userId

                });


            if (!contact) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Contact not found."

                });

            }


            res.json({

                success: true,

                message:
                    "Emergency contact deleted."

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to delete contact."

            });

        }

    }
);


/* ============================================================
   LOCATION
============================================================ */


/*
------------------------------------------------------------
SAVE LOCATION
------------------------------------------------------------
POST /api/location
------------------------------------------------------------
*/

app.post(
    "/api/location",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                latitude,
                longitude,
                accuracy
            } = req.body;


            /* --------------------------------------------
               CHECK LOCATION DATA
            -------------------------------------------- */

            if (
                latitude === undefined ||
                longitude === undefined
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Latitude and longitude are required."

                });

            }


            /* --------------------------------------------
               VALIDATE COORDINATES
            -------------------------------------------- */

            if (
                !validCoordinates(
                    latitude,
                    longitude
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid location coordinates."

                });

            }


            /* --------------------------------------------
               SAVE LOCATION
            -------------------------------------------- */

            const location =
                await Location.create({

                    userId:
                        req.user.userId,

                    latitude:
                        latitude,

                    longitude:
                        longitude,

                    accuracy:
                        accuracy ?? null

                });


            /* --------------------------------------------
               RESPONSE
            -------------------------------------------- */

            res.status(201).json({

                success: true,

                message:
                    "Location saved successfully.",

                location: {

                    id:
                        location._id,

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

                    accuracy:
                        location.accuracy,

                    timestamp:
                        location.timestamp

                }

            });


        } catch (error) {

            console.error(
                "Location save error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to save location."

            });

        }

    }
);



/*
------------------------------------------------------------
CREATE SOS EVENT
------------------------------------------------------------
POST /api/sos
------------------------------------------------------------
*/

app.post(
    "/api/sos",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                latitude,
                longitude,
                accuracy,
                message
            } = req.body;


            if (
                latitude !== undefined &&
                longitude !== undefined
            ) {

                if (
                    !validCoordinates(
                        latitude,
                        longitude
                    )
                ) {

                    return res.status(400).json({

                        success: false,

                        message:
                            "Invalid location coordinates."

                    });

                }

            }


            /*
            ------------------------------------------------
            GET USER
            ------------------------------------------------
            */

            const user =
                await User.findById(
                    req.user.userId
                );


            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "User not found."

                });

            }

            


            /*
            ------------------------------------------------
            GET EMERGENCY CONTACTS
            ------------------------------------------------
            */

            const contacts =
                await EmergencyContact
                    .find({
                        userId:
                            req.user.userId
                    })
                    .sort({
                        priority: 1,
                        createdAt: 1
                    });


            /*
            ------------------------------------------------
            CREATE SOS EVENT
            ------------------------------------------------
            */

            const emergency =
                await SOSEvent.create({

                    userId:
                        req.user.userId,

                    status:
                        "ACTIVE",

                    latitude:
                        latitude ?? null,

                    longitude:
                        longitude ?? null,

                    accuracy:
                        accuracy ?? null,

                    message:
                        message
                            ? String(message).slice(0, 1000)
                            : "Emergency assistance requested."

                });


            /*
            ------------------------------------------------
            SEND SMS ALERTS
            ------------------------------------------------
            */

            const alertResult =
                await sendSOSAlerts(
                    user,
                    contacts,
                    emergency
                );


            /*
            ------------------------------------------------
            RESPONSE
            ------------------------------------------------
            */

            res.status(201).json({

                success: true,

                message:
                    "Emergency SOS activated.",

                alertSent:
                    alertResult.success,

                alertMessage:
                    alertResult.message,

                recipients:
                    alertResult.recipients || [],

                emergency: {

                    id:
                        emergency._id,

                    status:
                        emergency.status,

                    latitude:
                        emergency.latitude,

                    longitude:
                        emergency.longitude,

                    createdAt:
                        emergency.createdAt

                }

            });


        } catch (error) {

            console.error(
                "SOS error:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to activate SOS."

            });

        }

    }
);


/*
------------------------------------------------------------
GET SOS HISTORY
------------------------------------------------------------
GET /api/sos
------------------------------------------------------------
*/

app.get(
    "/api/sos",
    authenticateToken,
    async (req, res) => {

        try {

            const events =
                await SOSEvent
                    .find({
                        userId:
                            req.user.userId
                    })
                    .sort({
                        createdAt: -1
                    })
                    .limit(100);


            res.json({

                success: true,

                events

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve SOS history."

            });

        }

    }
);


/*
------------------------------------------------------------
CANCEL SOS
------------------------------------------------------------
PATCH /api/sos/:id/cancel
------------------------------------------------------------
*/

app.patch(
    "/api/sos/:id/cancel",
    authenticateToken,
    async (req, res) => {

        try {

            const emergency =
                await SOSEvent.findOneAndUpdate(

                    {

                        _id:
                            req.params.id,

                        userId:
                            req.user.userId,

                        status:
                            "ACTIVE"

                    },

                    {

                        status:
                            "CANCELLED",

                        resolvedAt:
                            new Date()

                    },

                    {
                        new: true
                    }

                );


            if (!emergency) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Active SOS event not found."

                });

            }


            res.json({

                success: true,

                message:
                    "SOS cancelled.",

                emergency

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to cancel SOS."

            });

        }

    }
);


/*
------------------------------------------------------------
RESOLVE SOS
------------------------------------------------------------
PATCH /api/sos/:id/resolve
------------------------------------------------------------
*/

app.patch(
    "/api/sos/:id/resolve",
    authenticateToken,
    async (req, res) => {

        try {

            const emergency =
                await SOSEvent.findOneAndUpdate(

                    {

                        _id:
                            req.params.id,

                        userId:
                            req.user.userId

                    },

                    {

                        status:
                            "RESOLVED",

                        resolvedAt:
                            new Date()

                    },

                    {
                        new: true
                    }

                );


            if (!emergency) {

                return res.status(404).json({

                    success: false,

                    message:
                        "SOS event not found."

                });

            }


            res.json({

                success: true,

                message:
                    "SOS resolved.",

                emergency

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to resolve SOS."

            });

        }

    }
);


/* ============================================================
   USER LOCATION HISTORY
============================================================ */


/*
------------------------------------------------------------
GET LOCATION HISTORY
------------------------------------------------------------
GET /api/location/history
------------------------------------------------------------
*/

app.get(
    "/api/location/history",
    authenticateToken,
    async (req, res) => {

        try {

            const locations =
                await Location
                    .find({
                        userId:
                            req.user.userId
                    })
                    .sort({
                        timestamp: -1
                    })
                    .limit(100);


            res.json({

                success: true,

                locations

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to retrieve location history."

            });

        }

    }
);


/* ============================================================
   HEALTH CHECK
============================================================ */

app.get(
    "/api/health",
    async (req, res) => {

        const databaseConnected =
            mongoose.connection.readyState === 1;


        res.json({

            success: true,

            server:
                "online",

            database:
                databaseConnected
                    ? "connected"
                    : "disconnected",

            timestamp:
                new Date().toISOString()

        });

    }
);

/* ============================================================
   DEBUG API REQUESTS
============================================================ */

app.use("/api", (req, res, next) => {

    console.log(
        "API REQUEST:",
        req.method,
        req.originalUrl
    );

    next();

});
/* ============================================================
   UNKNOWN API ROUTE
============================================================ */

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "API endpoint not found."

        });

    }
);


/* ============================================================
   FRONTEND FALLBACK
============================================================ */

app.get(
    /.*/,
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


/* ============================================================
   ERROR HANDLER
============================================================ */

app.use(
    (error, req, res, next) => {

        console.error(
            "Server error:",
            error
        );


        res.status(500).json({

            success: false,

            message:
                "Internal server error."

        });

    }
);


/* ============================================================
   START SERVER
============================================================ */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "========================================"
        );

        console.log(
            "GUARDIAN SOS SERVER"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log(
            "========================================"
        );

    }
);

