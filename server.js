
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
const http = require("http");
const { Server } = require("socket.io");
const AfricasTalking = require("africastalking");


const admin = require("firebase-admin");
const { cert } = require("firebase-admin/app");

const fs = require("fs");
const multer = require("multer");



/* ============================================================
   CREATE EXPRESS APP
============================================================ */

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: true,
        credentials: true
    }
});




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
   FIREBASE CLOUD MESSAGING
============================================================ */

if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
) {

    if (admin.getApps().length === 0) {

        admin.initializeApp({

            credential: cert({

                projectId:
                    process.env.FIREBASE_PROJECT_ID,

                clientEmail:
                    process.env.FIREBASE_CLIENT_EMAIL,

                privateKey:
                    process.env.FIREBASE_PRIVATE_KEY
                        .replace(/\\n/g, "\n")

            })

        });

    }

    console.log(
        "Firebase Admin initialized successfully."
    );

} else {

    console.error(
        "Firebase environment variables are missing."
    );

}


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
   API REQUEST DEBUG
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
        fcmTokens: {
    type: [String],
    default: []
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



/* ============================================================
   GUARDIAN SOS CHAT FILE STORAGE
============================================================ */

const chatUploadDirectory = path.join(__dirname, "public", "chat-uploads");

// Create the upload folder only when the filesystem allows it.
// Vercel's deployed filesystem is read-only, so do not create
// directories there.
if (!process.env.VERCEL && !fs.existsSync(chatUploadDirectory)) {
    fs.mkdirSync(chatUploadDirectory, { recursive: true });
}

const chatStorage =
    multer.diskStorage({

        destination: function(req, file, cb) {

            cb(
                null,
                chatUploadDirectory
            );

        },

        filename: function(req, file, cb) {

            const safeName =
                file.originalname
                    .replace(/[^a-zA-Z0-9._-]/g, "_");

            cb(
                null,
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .substring(2, 10) +
                "-" +
                safeName
            );

        }

    });

const chatUpload =
    multer({

        storage: chatStorage,

        limits: {
            fileSize:
                100 * 1024 * 1024
        }

    });

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



function getPhoneVariants(phone) {
    const raw = String(phone || "")
        .trim()
        .replace(/[^\d+]/g, "");

    if (!raw) return [];

    const variants = new Set([raw]);

    // +254712345678
    if (raw.startsWith("+254") && raw.length === 13) {
        variants.add(raw.substring(1));          // 254712345678
        variants.add("0" + raw.substring(4));    // 0712345678
    }

    // 254712345678
    else if (raw.startsWith("254") && raw.length === 12) {
        variants.add("+" + raw);                 // +254712345678
        variants.add("0" + raw.substring(3));    // 0712345678
    }

    // 0712345678 / 0112345678
    else if (
        (raw.startsWith("07") || raw.startsWith("01")) &&
        raw.length === 10
    ) {
        const normalized = "+254" + raw.substring(1);

        variants.add(normalized);                // +254712345678
        variants.add(normalized.substring(1));   // 254712345678
    }

    return [...variants];
}

/* ============================================================
   CHAT SCHEMAS
============================================================ */

const ConversationSchema = new mongoose.Schema({

    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }],

    emergencyParticipants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],

    isGroup: {
        type: Boolean,
        default: false
    },

    groupName: {
        type: String,
        default: ""
    },

    lastMessage: {
        type: String,
        default: ""
    },

    lastMessageAt: {
        type: Date,
        default: Date.now
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});


const MessageSchema = new mongoose.Schema({

    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Conversation",
        required: true
    },

    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    text: {
        type: String,
        required: true,
        maxlength: 5000
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]

});

/* ============================================================
   CREATE MODELS
============================================================ */

const User =
    mongoose.models.User ||
    mongoose.model("User", UserSchema);

const EmergencyContact =
    mongoose.models.EmergencyContact ||
    mongoose.model(
        "EmergencyContact",
        EmergencyContactSchema
    );

const SOSEvent =
    mongoose.models.SOSEvent ||
    mongoose.model(
        "SOSEvent",
        SOSEventSchema
    );

const Location =
    mongoose.models.Location ||
    mongoose.model(
        "Location",
        LocationSchema
    );

    const Conversation =
    mongoose.models.Conversation ||
    mongoose.model(
        "Conversation",
        ConversationSchema
    );

const Message =
    mongoose.models.Message ||
    mongoose.model(
        "Message",
        MessageSchema
    );


/* ============================================================
   CHAT CONVERSATION SCHEMA
============================================================ */

const ChatConversationSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            }
        ],

        lastMessage: {
            type: String,
            default: ""
        },

        lastMessageAt: {
            type: Date,
            default: Date.now
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    }
);




/* ============================================================
   CHAT MESSAGE SCHEMA
============================================================ */

const ChatMessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ChatConversation",
            required: true
        },

        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        recipientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        text: {
    type: String,
    required: false,
    default: "",
    trim: true,
    maxlength: 5000
},

        read: {
            type: Boolean,
            default: false
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    }
);



/* ============================================================
   ADVANCED CHAT MESSAGE FIELDS
============================================================ */

ChatMessageSchema.add({

    type: {
        type: String,
        enum: [
            "text",
            "image",
            "video",
            "audio",
            "voice",
            "file",
            "location",
            "contact",
            "system"
        ],
        default: "text"
    },

    attachment: {
        url: {
            type: String,
            default: ""
        },

        name: {
            type: String,
            default: ""
        },

        mimeType: {
            type: String,
            default: ""
        },

        size: {
            type: Number,
            default: 0
        }
    },

    thumbnail: {
        type: String,
        default: ""
    },

    duration: {
        type: Number,
        default: 0
    },

    latitude: {
        type: Number,
        default: null
    },

    longitude: {
        type: Number,
        default: null
    },

    contactData: {
        name: {
            type: String,
            default: ""
        },

        phone: {
            type: String,
            default: ""
        }
    },

    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatMessage",
        default: null
    },

    reactions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },

        emoji: {
            type: String
        }
    }],

    edited: {
        type: Boolean,
        default: false
    },

    deletedForEveryone: {
        type: Boolean,
        default: false
    },

    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }],

    deliveredAt: {
        type: Date,
        default: null
    },

    readAt: {
        type: Date,
        default: null
    },

    starredBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }]

});


/* ============================================================
   CHAT MODELS
============================================================ */

const ChatConversation =
    mongoose.models.ChatConversation ||
    mongoose.model(
        "ChatConversation",
        ChatConversationSchema
    );

const ChatMessage =
    mongoose.models.ChatMessage ||
    mongoose.model(
        "ChatMessage",
        ChatMessageSchema
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


/* ============================================================
   SOCKET.IO AUTHENTICATION
============================================================ */

io.use((socket, next) => {

    try {

        const token =
            socket.handshake.auth &&
            socket.handshake.auth.token;

        if (!token) {
            return next(
                new Error("Authentication required.")
            );
        }

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );

        socket.userId =
            decoded.userId;

        socket.userEmail =
            decoded.email;

        next();

    } catch (error) {

        console.error(
            "Socket authentication error:",
            error.message
        );

        next(
            new Error("Invalid or expired token.")
        );

    }

});


/* ============================================================
   REAL-TIME CHAT
============================================================ */

io.on("connection", (socket) => {

    console.log(
        "Chat connected:",
        socket.userId
    );


    /*
     * USER JOINS THEIR PRIVATE ROOM
     */

    const userRoom =
        "user:" + socket.userId;

    socket.join(userRoom);
    /* ============================================================
       USER ONLINE STATUS
    ============================================================ */

    socket.on(
        "check_user_status",
        function(userId) {

            if (!userId) {
                return;
            }

            const targetRoom =
                io.sockets.adapter.rooms.get(
                    "user:" + String(userId)
                );

            const online =
                !!targetRoom &&
                targetRoom.size > 0;

            socket.emit(
                "user_status",
                {
                    userId: String(userId),
                    online: online
                }
            );

        }
    );


    /*
     * Tell the other user when this user
     * becomes available.
     */
    io.emit(
    "user_status",
    {
        userId: String(socket.userId),
        online: true
    }
);

    /*
     * SEND MESSAGE
     */

    socket.on(
        "send_message",
        async (data) => {

            try {

                const recipientId =
                    String(data.recipientId || "").trim();

                const text =
                    String(data.text || "").trim();


                if (!recipientId) {
                    return;
                }

                if (!text) {
                    return;
                }


                if (text.length > 5000) {

                    socket.emit(
                        "chat_error",
                        {
                            message:
                                "Message is too long."
                        }
                    );

                    return;
                }


                /*
                 * MAKE SURE RECIPIENT EXISTS
                 */

                const recipient =
                    await User.findById(
                        recipientId
                    );

                if (!recipient) {

                    socket.emit(
                        "chat_error",
                        {
                            message:
                                "User not found."
                        }
                    );

                    return;
                }


                /*
                 * FIND EXISTING CONVERSATION
                 */

                let conversation =
                    await ChatConversation.findOne(
                        {
                            participants: {
                                $all: [
                                    socket.userId,
                                    recipientId
                                ]
                            }
                        }
                    );


                /*
                 * CREATE CONVERSATION
                 * IF IT DOES NOT EXIST
                 */

                if (!conversation) {

                    conversation =
                        await ChatConversation.create(
                            {
                                participants: [
                                    socket.userId,
                                    recipientId
                                ],

                                lastMessage:
                                    text,

                                lastMessageAt:
                                    new Date()
                            }
                        );

                } else {

                    conversation.lastMessage =
                        text;

                    conversation.lastMessageAt =
                        new Date();

                    await conversation.save();

                }


                /*
                 * SAVE MESSAGE
                 */

                const message =
                    await ChatMessage.create(
                        {
                            conversationId:
                                conversation._id,

                            senderId:
                                socket.userId,

                            recipientId:
                                recipientId,

                            text:
                                text,

                            read:
                                false
                        }
                    );


                /*
                 * GET SENDER
                 */

                const sender =
                    await User.findById(
                        socket.userId
                    ).select(
                        "name email phone"
                    );


                const messageData = {

                    _id:
                        message._id,

                    conversationId:
                        conversation._id,

                    senderId:
                        socket.userId,

                    recipientId:
                        recipientId,

                    text:
                        message.text,

                    read:
                        message.read,

                    createdAt:
                        message.createdAt,

                    senderName:
                        sender
                            ? sender.name
                            : "User"

                };


                /*
                 * SEND TO SENDER
                 */

                io.to(
                    "user:" + socket.userId
                ).emit(
                    "new_message",
                    messageData
                );


                /*
                 * SEND IMMEDIATELY TO RECIPIENT
                 */

                io.to(
                    "user:" + recipientId
                ).emit(
                    "new_message",
                    messageData
                );


                console.log(
                    "Chat message delivered:",
                    socket.userId,
                    "→",
                    recipientId
                );


            } catch (error) {

                console.error(
                    "Chat message error:",
                    error
                );

                socket.emit(
                    "chat_error",
                    {
                        message:
                            "Unable to send message."
                    }
                );

            }

        }
    );

    /* ============================================================
   TYPING INDICATOR
============================================================ */

socket.on(
    "typing",
    function(data) {

        if (!data || !data.recipientId) {
            return;
        }

        io.to(
            "user:" +
            data.recipientId
        ).emit(
            "typing",
            {
                userId:
                    socket.userId,

                typing:
                    Boolean(data.typing)
            }
        );

    }
);

/* ============================================================
   WEBRTC VOICE / VIDEO CALL SIGNALING
============================================================ */

socket.on(
    "call_user",
    function(data) {

        if (!data || !data.userId) {
            return;
        }

        io.to(
            "user:" +
            data.userId
        ).emit(
            "incoming_call",
            {
                callerId:
                    socket.userId,

                callType:
                    data.callType || "voice",

                offer:
                    data.offer || null
            }
        );

    }
);


socket.on(
    "answer_call",
    function(data) {

        if (!data || !data.userId) {
            return;
        }

        io.to(
            "user:" +
            data.userId
        ).emit(
            "call_answered",
            {
                answer:
                    data.answer
            }
        );

    }
);


socket.on(
    "ice_candidate",
    function(data) {

        if (!data || !data.userId) {
            return;
        }

        io.to(
            "user:" +
            data.userId
        ).emit(
            "ice_candidate",
            {
                candidate:
                    data.candidate
            }
        );

    }
);


socket.on(
    "reject_call",
    function(data) {

        if (!data || !data.userId) {
            return;
        }

        io.to(
            "user:" +
            data.userId
        ).emit(
            "call_rejected"
        );

    }
);


socket.on(
    "end_call",
    function(data) {

        if (!data || !data.userId) {
            return;
        }

        io.to(
            "user:" +
            data.userId
        ).emit(
            "call_ended"
        );

    }
);
    /*
     * DISCONNECT
     */

    socket.on(
    "disconnect",
    () => {

        console.log(
            "Chat disconnected:",
            socket.userId
        );

        /*
         * Check whether this user still has
         * another active socket connection.
         */
        const remainingRoom =
            io.sockets.adapter.rooms.get(
                "user:" + String(socket.userId)
            );

        const stillOnline =
            !!remainingRoom &&
            remainingRoom.size > 0;

        if (!stillOnline) {

            io.emit(
                "user_status",
                {
                    userId:
                        String(socket.userId),

                    online:
                        false
                }
            );

        }

    }
);

});

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
        .map(contact => {

            let phone =
                String(contact.phone).trim();

            if (
                phone.startsWith("07") &&
                phone.length === 10
            ) {
                phone =
                    "+254" +
                    phone.substring(1);
            }

            if (
                phone.startsWith("254") &&
                !phone.startsWith("+254")
            ) {
                phone =
                    "+" +
                    phone;
            }

            return phone;

        })
        .filter(phone => phone.length > 0);


console.log(
    "========================================"
);

console.log(
    "GUARDIAN SOS SMS"
);

console.log(
    "AT USERNAME:",
    process.env.AT_USERNAME
        ? "CONFIGURED"
        : "MISSING"
);

console.log(
    "AT API KEY:",
    process.env.AT_API_KEY
        ? "CONFIGURED"
        : "MISSING"
);

console.log(
    "CONTACTS:",
    contacts.map(contact => ({
        name: contact.name,
        phone: contact.phone
    }))
);

console.log(
    "SMS RECIPIENTS:",
    phoneNumbers
);

console.log(
    "========================================"
);


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
   SEND FCM PUSH NOTIFICATIONS
============================================================ */

async function sendFCMAlerts(
    user,
    contacts,
    emergency
) {

    try {

        if (!admin.apps.length) {

            return {
                success: false,
                message:
                    "Firebase Admin is not initialized."
            };

        }

        if (
            !contacts ||
            !contacts.length
        ) {

            return {
                success: false,
                message:
                    "No emergency contacts saved."
            };

        }

        const recipientIds =
            new Set();

        for (
            const contact
            of contacts
        ) {

            const variants =
                getPhoneVariants(
                    contact.phone
                );

            if (!variants.length) {
                continue;
            }

            const users =
                await User.find({
                    _id: {
                        $ne: user._id
                    },
                    phone: {
                        $in: variants
                    }
                }).select(
                    "_id fcmTokens"
                );

            for (
                const registeredUser
                of users
            ) {

                recipientIds.add(
                    String(
                        registeredUser._id
                    )
                );

            }

        }

        if (
            recipientIds.size === 0
        ) {

            return {
                success: false,
                message:
                    "No saved emergency contacts are registered on Guardian SOS."
            };

        }

        const recipients =
            await User.find({
                _id: {
                    $in:
                        [...recipientIds]
                }
            }).select(
                "fcmTokens"
            );

        const tokens = [
            ...new Set(
                recipients.flatMap(
                    recipient =>
                        recipient.fcmTokens || []
                )
            )
        ];

        if (!tokens.length) {

            return {
                success: false,
                message:
                    "Saved contacts have no registered notification devices."
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

        const response =
            await admin
                .messaging()
                .sendEachForMulticast({

                    tokens:

                        tokens,

                    notification: {

                        title:
                            "🚨 GUARDIAN SOS ALERT",

                        body:
                            `${user.name} has activated an emergency SOS.`
                    },

                    data: {

                        type:
                            "SOS",

                        emergencyId:
                            emergency._id
                                .toString(),

                        latitude:
                            String(
                                emergency.latitude ??
                                ""
                            ),

                        longitude:
                            String(
                                emergency.longitude ??
                                ""
                            ),

                        location:
                            locationText
                    }

                });

        return {

            success:
                response.successCount > 0,

            message:
                `${response.successCount} emergency contact notification(s) sent.`,

            successCount:
                response.successCount,

            failureCount:
                response.failureCount

        };

    } catch (error) {

        console.error(
            "FCM SOS error:",
            error
        );

        return {

            success: false,

            message:
                error.message ||
                "Unable to send SOS notifications."

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
   FIREBASE DEVICE TOKEN
============================================================ */

/*
------------------------------------------------------------
SAVE FCM DEVICE TOKEN
------------------------------------------------------------
POST /api/fcm-token
------------------------------------------------------------
*/

app.post(
    "/api/fcm-token",
    authenticateToken,
    async (req, res) => {

        try {

            const { token } = req.body;

            if (!token) {

                return res.status(400).json({

                    success: false,

                    message:
                        "FCM token is required."

                });

            }

            await User.findByIdAndUpdate(

                req.user.userId,

                {
                    $addToSet: {
                        fcmTokens: token
                    }
                }

            );

            res.json({

                success: true,

                message:
                    "FCM device token saved."

            });

        } catch (error) {

            console.error(
                "FCM token error:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to save FCM token."

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
   PHONE NUMBER VARIANTS FOR GUARDIAN SOS CHAT
============================================================ */

function getPhoneVariants(phone) {

    const raw =
        String(phone || "")
            .trim()
            .replace(/[^\d+]/g, "");

    if (!raw) {
        return [];
    }

    const variants = new Set();

    variants.add(raw);

    /*
     * Kenya:
     * 0712345678
     * 254712345678
     * +254712345678
     */

    if (
        raw.startsWith("+254") &&
        raw.length === 13
    ) {

        variants.add(
            raw.substring(1)
        );

        variants.add(
            "0" + raw.substring(4)
        );

    }

    else if (
        raw.startsWith("254") &&
        raw.length === 12
    ) {

        variants.add(
            "+" + raw
        );

        variants.add(
            "0" + raw.substring(3)
        );

    }

    else if (
        (
            raw.startsWith("07") ||
            raw.startsWith("01")
        ) &&
        raw.length === 10
    ) {

        const international =
            "+254" + raw.substring(1);

        variants.add(
            international
        );

        variants.add(
            international.substring(1)
        );

    }

    return [...variants];

}



app.get(
    "/api/chat/find-user-by-phone",
    authenticateToken,
    async (req, res) => {
        try {
            const phone = String(req.query.phone || "").trim();

            const variants = getPhoneVariants(phone);

            if (!variants.length) {
                return res.json({
                    success: true,
                    found: false,
                    user: null
                });
            }

            const user = await User.findOne({
                _id: { $ne: req.user.userId },
                phone: { $in: variants }
            }).select("_id name email phone");

            if (!user) {
                return res.json({
                    success: true,
                    found: false,
                    user: null
                });
            }

            return res.json({
                success: true,
                found: true,
                user: user
            });

        } catch (error) {

            console.error(
                "Find chat user by phone error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Unable to find Guardian SOS user."
            });
        }
    }
);
/* ============================================================
   CHAT USER SEARCH
============================================================ */

app.get(
    "/api/chat/users",
    authenticateToken,
    async (req, res) => {

        try {

            const q =
                String(req.query.q || "")
                    .trim();

            if (q.length < 2) {

                return res.json({
                    success: true,
                    users: []
                });

            }

            const users =
                await User.find({
                    _id: {
                        $ne: req.user.userId
                    },
                    $or: [
                        {
                            name: {
                                $regex: q,
                                $options: "i"
                            }
                        },
                        {
                            email: {
                                $regex: q,
                                $options: "i"
                            }
                        },
                        {
                            phone: {
                                $regex: q,
                                $options: "i"
                            }
                        }
                    ]
                })
                .select("_id name email phone")
                .limit(20);

            res.json({
                success: true,
                users
            });

        } catch (error) {

            console.error(
                "Chat user search error:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Unable to search users."
            });

        }

    }
);

/* ============================================================
   CREATE / OPEN DIRECT CHAT
============================================================ */

app.post(
    "/api/chat/conversations",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                userId
            } = req.body;

            if (!userId) {

                return res.status(400).json({
                    success: false,
                    message: "User ID is required."
                });

            }

            if (
                String(userId) ===
                String(req.user.userId)
            ) {

                return res.status(400).json({
                    success: false,
                    message: "You cannot chat with yourself."
                });

            }

            /*
             * ONLY REGISTERED GUARDIAN SOS USERS
             */

            const targetUser =
                await User.findById(userId)
                    .select("_id name email phone");

            if (!targetUser) {

                return res.status(404).json({
                    success: false,
                    message:
                        "This user is not registered on Guardian SOS."
                });

            }


            /*
             * FIND EXISTING DIRECT CHAT
             */

            let conversation =
                await ChatConversation.findOne({

                    participants: {
                        $all: [
                            req.user.userId,
                            userId
                        ],

                        $size: 2
                    }

                });


            /*
             * CREATE CHAT IF IT DOES NOT EXIST
             */

            if (!conversation) {

                conversation =
                    await ChatConversation.create({

                        participants: [
                            req.user.userId,
                            userId
                        ],

                        lastMessage: "",

                        lastMessageAt:
                            new Date()

                    });

            }


            /*
             * LOAD PARTICIPANTS
             */

            conversation =
                await ChatConversation
                    .findById(
                        conversation._id
                    )
                    .populate(
                        "participants",
                        "_id name email phone"
                    );


            return res.status(200).json({

                success: true,

                conversation

            });


        } catch (error) {

            console.error(
                "Open direct chat error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to open conversation."

            });

        }

    }
);

/* ============================================================
   GET CHAT CONVERSATIONS
============================================================ */

app.get(
    "/api/chat/conversations",
    authenticateToken,
    async (req, res) => {

        try {

            const conversations =
                await ChatConversation
                    .find({
                        participants:
                            req.user.userId
                    })
                    .populate(
                        "participants",
                        "_id name email phone"
                    )
                    .sort({
                        lastMessageAt: -1
                    });


            return res.json({

                success: true,

                conversations

            });


        } catch (error) {

            console.error(
                "Load chats error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load chats."

            });

        }

    }
);


/* ============================================================
   SEND CHAT MESSAGE
============================================================ */

app.post(
    "/api/chat/messages",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                conversationId,
                text
            } = req.body;


            const messageText =
                String(text || "").trim();


            if (!conversationId || !messageText) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Conversation and message are required."

                });

            }


            if (messageText.length > 5000) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Message is too long."

                });

            }


            /*
             * MAKE SURE CURRENT USER
             * BELONGS TO CHAT
             */

            const conversation =
                await ChatConversation.findOne({

                    _id:
                        conversationId,

                    participants:
                        req.user.userId

                });


            if (!conversation) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not a member of this chat."

                });

            }


            /*
             * FIND OTHER PARTICIPANT
             */

            const recipientId =
                conversation.participants.find(
                    participant =>
                        String(participant) !==
                        String(req.user.userId)
                );


            if (!recipientId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Chat recipient not found."

                });

            }


            /*
             * SAVE MESSAGE
             */

            const message =
                await ChatMessage.create({

                    conversationId:
                        conversation._id,

                    senderId:
                        req.user.userId,

                    recipientId:
                        recipientId,

                    text:
                        messageText,

                    read:
                        false

                });


            /*
             * UPDATE CONVERSATION
             */

            conversation.lastMessage =
                messageText;

            conversation.lastMessageAt =
                new Date();

            await conversation.save();


            /*
             * RETURN MESSAGE
             */

            const populatedMessage =
                await ChatMessage
                    .findById(
                        message._id
                    )
                    .populate(
                        "senderId",
                        "_id name email phone"
                    )
                    .populate(
                        "recipientId",
                        "_id name email phone"
                    )
                    .populate(
                        "replyTo",
                     "_id senderId text type attachment createdAt"
);
                    ;
                    


            return res.status(201).json({

                success: true,

                message:
                    populatedMessage

            });


        } catch (error) {

            console.error(
                "Send chat message error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send message."

            });

        }

    }
);

/* ============================================================
   GET CHAT MESSAGES
============================================================ */

app.get(
    "/api/chat/messages/:conversationId",
    authenticateToken,
    async (req, res) => {

        try {

            /*
             * MAKE SURE USER BELONGS
             * TO THIS CHAT
             */

            const conversation =
                await ChatConversation.findOne({

                    _id:
                        req.params.conversationId,

                    participants:
                        req.user.userId

                });


            if (!conversation) {

                return res.status(403).json({

                    success: false,

                    message:
                        "You are not a member of this chat."

                });

            }


            /*
             * LOAD CHAT MESSAGES
             */

            const messages =
                await ChatMessage
                    .find({

                        conversationId:
                            conversation._id

                    })
                    .populate(
                        "senderId",
                        "_id name email phone"
                    )
                    .populate(
                        "recipientId",
                        "_id name email phone"
                    )
                    .populate(
                        "replyTo",
                        "_id senderId text type attachment createdAt"
)
                    .sort({
                        createdAt: 1
                    })
                    .limit(500);


            return res.json({

                success: true,

                messages

            });


        } catch (error) {

            console.error(
                "Get chat messages error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to load messages."

            });

        }

    }
);




/* ============================================================
   CHAT FILE / PHOTO / VIDEO / AUDIO UPLOAD
============================================================ */

app.post(
    "/api/chat/upload",
    authenticateToken,
    chatUpload.single("file"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "No file selected."
                });

            }

            const fileUrl =
                "/chat-uploads/" +
                req.file.filename;

            return res.json({

                success: true,

                file: {

                    url: fileUrl,

                    name:
                        req.file.originalname,

                    mimeType:
                        req.file.mimetype,

                    size:
                        req.file.size

                }

            });

        } catch (error) {

            console.error(
                "Chat upload error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to upload file."

            });

        }

    }
);



/* ============================================================
   CHAT FILE / PHOTO / VIDEO / AUDIO UPLOAD
============================================================ */

app.post(
    "/api/chat/upload",
    authenticateToken,
    chatUpload.single("file"),
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "No file selected."
                });

            }

            const fileUrl =
                "/chat-uploads/" +
                req.file.filename;

            return res.json({

                success: true,

                file: {

                    url: fileUrl,

                    name:
                        req.file.originalname,

                    mimeType:
                        req.file.mimetype,

                    size:
                        req.file.size

                }

            });

        } catch (error) {

            console.error(
                "Chat upload error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to upload file."

            });

        }

    }
);


/* ============================================================
   SEND ADVANCED CHAT MESSAGE
============================================================ */

app.post(
    "/api/chat/messages/advanced",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                conversationId,
                text,
                type,
                attachment,
                duration,
                latitude,
                longitude,
                contactData,
                replyTo
            } = req.body;

            if (!conversationId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Conversation ID is required."
                });

            }

            const conversation =
                await ChatConversation.findOne({

                    _id: conversationId,

                    participants:
                        req.user.userId

                });

            if (!conversation) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You are not a member of this chat."
                });

            }

            const recipientId =
                conversation.participants.find(
                    id =>
                        String(id) !==
                        String(req.user.userId)
                );

            if (!recipientId) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Recipient not found."
                });

            }

            const message =
                await ChatMessage.create({

                    conversationId:
                        conversation._id,

                    senderId:
                        req.user.userId,

                    recipientId,

                    text:
                        String(text || ""),

                    type:
                        type || "text",

                    attachment:
                        attachment || {},

                    duration:
                        Number(duration || 0),

                    latitude:
                        latitude !== undefined
                            ? latitude
                            : null,

                    longitude:
                        longitude !== undefined
                            ? longitude
                            : null,

                    contactData:
                        contactData || {},

                    replyTo:
                        replyTo || null,

                    deliveredAt:
                        new Date()

                });

            conversation.lastMessage =
                type === "text"
                    ? String(text || "")
                    : type === "image"
                        ? "📷 Photo"
                        : type === "video"
                            ? "🎥 Video"
                            : type === "voice"
                                ? "🎤 Voice message"
                                : type === "audio"
                                    ? "🎵 Audio"
                                    : type === "file"
                                        ? "📎 File"
                                        : "Message";

            conversation.lastMessageAt =
                new Date();

            await conversation.save();

            const populatedMessage =
                await ChatMessage
                    .findById(message._id)
                    .populate(
                        "senderId",
                        "_id name email phone"
                    )
                    .populate(
                        "recipientId",
                        "_id name email phone"
                    );

            const messageData =
                populatedMessage.toObject();

            io.to(
                "user:" +
                req.user.userId
            ).emit(
                "new_message",
                messageData
            );

            io.to(
                "user:" +
                recipientId
            ).emit(
                "new_message",
                messageData
            );

            return res.status(201).json({

                success: true,

                message:
                    messageData

            });

        } catch (error) {

            console.error(
                "Advanced chat message error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to send message."

            });

        }

    }
);


/* ============================================================
   MESSAGE REACTION
============================================================ */

app.post(
    "/api/chat/messages/:id/reaction",
    authenticateToken,
    async (req, res) => {

        try {

            const {
                emoji
            } = req.body;

            const message =
                await ChatMessage.findById(
                    req.params.id
                );

            if (!message) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message not found."
                });

            }

            message.reactions =
                message.reactions.filter(
                    reaction =>
                        String(
                            reaction.userId
                        ) !==
                        String(
                            req.user.userId
                        )
                );

            if (emoji) {

                message.reactions.push({

                    userId:
                        req.user.userId,

                    emoji

                });

            }

            await message.save();

            const recipientId =
                String(message.senderId) ===
                String(req.user.userId)
                    ? message.recipientId
                    : message.senderId;

            io.to(
                "user:" +
                recipientId
            ).emit(
                "message_reaction",
                {
                    messageId:
                        message._id,

                    reactions:
                        message.reactions
                }
            );

            return res.json({

                success: true,

                reactions:
                    message.reactions

            });

        } catch (error) {

            console.error(
                "Reaction error:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Unable to react."

            });

        }

    }
);

/* ============================================================
   DELETE MESSAGE FOR ME
============================================================ */

app.delete(
    "/api/chat/messages/:id/delete-for-me",
    authenticateToken,
    async (req, res) => {

        try {

            const message =
                await ChatMessage.findById(
                    req.params.id
                );

            if (!message) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message not found."
                });

            }

            const isParticipant =
                String(message.senderId) ===
                    String(req.user.userId) ||
                String(message.recipientId) ===
                    String(req.user.userId);

            if (!isParticipant) {

                return res.status(403).json({
                    success: false,
                    message:
                        "You are not allowed to delete this message."
                });

            }

            if (
                !message.deletedFor.some(
                    userId =>
                        String(userId) ===
                        String(req.user.userId)
                )
            ) {

                message.deletedFor.push(
                    req.user.userId
                );

                await message.save();

            }

            return res.json({
                success: true,
                message:
                    "Message deleted for you."
            });

        } catch (error) {

            console.error(
                "Delete for me error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to delete message."
            });

        }

    }
);


/* ============================================================
   DELETE MESSAGE FOR EVERYONE
============================================================ */

app.delete(
    "/api/chat/messages/:id/delete-for-everyone",
    authenticateToken,
    async (req, res) => {

        try {

            const message =
                await ChatMessage.findById(
                    req.params.id
                );

            if (!message) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message not found."
                });

            }

            if (
                String(message.senderId) !==
                String(req.user.userId)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only the sender can delete this message for everyone."
                });

            }

            message.deletedForEveryone =
                true;

            message.text =
                "This message was deleted";

            await message.save();

            io.to(
                "user:" +
                String(message.senderId)
            ).emit(
                "message_deleted",
                {
                    messageId:
                        String(message._id),

                    deletedForEveryone:
                        true
                }
            );

            io.to(
                "user:" +
                String(message.recipientId)
            ).emit(
                "message_deleted",
                {
                    messageId:
                        String(message._id),

                    deletedForEveryone:
                        true
                }
            );

            return res.json({
                success: true,
                message:
                    "Message deleted for everyone."
            });

        } catch (error) {

            console.error(
                "Delete for everyone error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to delete message."
            });

        }

    }
);


/* ============================================================
   EDIT MESSAGE
============================================================ */

app.patch(
    "/api/chat/messages/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const text =
                String(
                    req.body.text || ""
                ).trim();

            if (!text) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message text is required."
                });

            }

            if (text.length > 5000) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message is too long."
                });

            }

            const message =
                await ChatMessage.findById(
                    req.params.id
                );

            if (!message) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message not found."
                });

            }

            if (
                String(message.senderId) !==
                String(req.user.userId)
            ) {

                return res.status(403).json({
                    success: false,
                    message:
                        "Only the sender can edit this message."
                });

            }

            if (
                message.deletedForEveryone
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Deleted messages cannot be edited."
                });

            }

            message.text =
                text;

            message.edited =
                true;

            await message.save();

            const updateData = {
                messageId:
                    String(message._id),

                text:
                    message.text,

                edited:
                    true
            };

            io.to(
                "user:" +
                String(message.senderId)
            ).emit(
                "message_updated",
                updateData
            );

            io.to(
                "user:" +
                String(message.recipientId)
            ).emit(
                "message_updated",
                updateData
            );

            return res.json({
                success: true,
                message:
                    message
            });

        } catch (error) {

            console.error(
                "Edit message error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to edit message."
            });

        }

    }
);

/* ============================================================
   STAR / UNSTAR MESSAGE
============================================================ */

app.post(
    "/api/chat/messages/:id/star",
    authenticateToken,
    async (req, res) => {

        try {

            const message =
                await ChatMessage.findById(
                    req.params.id
                );

            if (!message) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Message not found."
                });

            }

            const userId =
                String(req.user.userId);

            const alreadyStarred =
                message.starredBy.some(
                    id =>
                        String(id) ===
                        userId
                );

            if (alreadyStarred) {

                message.starredBy =
                    message.starredBy.filter(
                        id =>
                            String(id) !==
                            userId
                    );

            } else {

                message.starredBy.push(
                    req.user.userId
                );

            }

            await message.save();

            const starData = {
                messageId:
                    String(message._id),

                starred:
                    !alreadyStarred
            };

            io.to(
                "user:" +
                String(message.senderId)
            ).emit(
                "message_starred",
                starData
            );

            io.to(
                "user:" +
                String(message.recipientId)
            ).emit(
                "message_starred",
                starData
            );

            return res.json({
                success: true,
                starred:
                    !alreadyStarred
            });

        } catch (error) {

            console.error(
                "Star message error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to star message."
            });

        }

    }
);
/* ============================================================
   SEND SOS TO EMERGENCY CHAT MEMBERS
============================================================ */



async function sendChatSOSAlert(user, contacts, emergency) {

    try {

        if (!contacts || !contacts.length) {
            return {
                success: true,
                count: 0,
                message: "No emergency contacts saved."
            };
        }

        const recipientIds = new Set();

        /*
         * FIND REGISTERED GUARDIAN SOS USERS
         * USING THE SAVED EMERGENCY CONTACT PHONE NUMBERS
         */

        for (const contact of contacts) {

            const variants = getPhoneVariants(
                contact.phone
            );

            if (!variants.length) {
                continue;
            }

            const registeredUsers =
                await User.find({
                    _id: {
                        $ne: user._id
                    },
                    phone: {
                        $in: variants
                    }
                }).select("_id name phone fcmTokens");

            for (const registeredUser of registeredUsers) {

                recipientIds.add(
                    String(registeredUser._id)
                );

            }

        }

        const uniqueRecipientIds =
            [...recipientIds];

        if (!uniqueRecipientIds.length) {

            return {
                success: true,
                count: 0,
                message:
                    "No saved emergency contacts are registered on Guardian SOS."
            };

        }

        /*
         * GET REGISTERED EMERGENCY CONTACT USERS
         */

        const recipients =
            await User.find({
                _id: {
                    $in: uniqueRecipientIds
                }
            });

        /*
         * LOCATION
         */

        const locationText =
            emergency.latitude !== null &&
            emergency.longitude !== null

                ? `https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`

                : "Location unavailable.";

        /*
         * SOS CHAT MESSAGE
         */

        const sosText =
            `🚨 GUARDIAN SOS ALERT\n\n` +
            `${user.name} has activated an emergency SOS.\n\n` +
            `Phone: ${user.phone || "Not provided"}\n\n` +
            `Location: ${locationText}\n\n` +
            `Please contact or assist immediately.`;

        /*
         * CREATE CHAT MESSAGE FOR EACH
         * SAVED CONTACT WHO HAS AN ACCOUNT
         */

        for (const recipient of recipients) {

            let conversation =
                await ChatConversation.findOne({

                    participants: {
                        $all: [
                            user._id,
                            recipient._id
                        ],

                        $size: 2
                    }

                });

            if (!conversation) {

                conversation =
                    await ChatConversation.create({

                        participants: [
                            user._id,
                            recipient._id
                        ],

                        lastMessage:
                            "🚨 Guardian SOS Alert",

                        lastMessageAt:
                            new Date()

                    });

            } else {

                conversation.lastMessage =
                    "🚨 Guardian SOS Alert";

                conversation.lastMessageAt =
                    new Date();

                await conversation.save();

            }

            const message =
                await ChatMessage.create({

                    conversationId:
                        conversation._id,

                    senderId:
                        user._id,

                    recipientId:
                        recipient._id,

                    text:
                        sosText,

                    type:
                        "system",

                    latitude:
                        emergency.latitude,

                    longitude:
                        emergency.longitude,

                    deliveredAt:
                        new Date()

                });

            const messageData =
                await ChatMessage
                    .findById(message._id)
                    .populate(
                        "senderId",
                        "_id name email phone"
                    )
                    .populate(
                        "recipientId",
                        "_id name email phone"
                    );

            /*
             * REAL-TIME CHAT MESSAGE
             */

            io.to(
                "user:" +
                String(recipient._id)
            ).emit(
                "new_message",
                messageData
            );

            /*
             * PUSH NOTIFICATION
             */

            if (
                recipient.fcmTokens &&
                recipient.fcmTokens.length &&
                admin.apps.length
            ) {

                await admin
                    .messaging()
                    .sendEachForMulticast({

                        tokens:
                            recipient.fcmTokens,

                        notification: {

                            title:
                                "🚨 Guardian SOS Alert",

                            body:
                                `${user.name} has activated an emergency SOS.`

                        },

                        data: {

                            type:
                                "CHAT_SOS",

                            emergencyId:
                                String(
                                    emergency._id
                                ),

                            senderId:
                                String(
                                    user._id
                                ),

                            location:
                                locationText

                        }

                    });

            }

        }

        return {

            success: true,

            count:
                recipients.length,

            message:
                `${recipients.length} saved emergency contact(s) alerted.`

        };

    } catch (error) {

        console.error(
            "Chat SOS error:",
            error
        );

        return {

            success: false,

            count: 0,

            message:
                "Unable to alert emergency contacts."

        };

    }

}



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

        console.log("🔥 SOS ROUTE WAS CALLED");

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


const fcmResult =
    await sendFCMAlerts(
        user,
        contacts,
        emergency
    );


const chatSOSResult =
    await sendChatSOSAlert(
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

    smsStatus:
        alertResult.success
            ? "SMS SENT"
            : "SMS NOT SENT",

            fcmStatus:
    fcmResult.success
        ? "PUSH SENT"
        : "PUSH NOT SENT",

fcmMessage:
    fcmResult.message,

    recipients:
        alertResult.recipients || [],

chatSOSStatus:
    chatSOSResult.success
        ? "CHAT SOS SENT"
        : "CHAT SOS NOT SENT",

chatSOSMessage:
    chatSOSResult.message,

chatSOSRecipients:
    chatSOSResult.count,
        
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




/*
------------------------------------------------------------
DELETE SOS
------------------------------------------------------------
DELETE /api/sos/:id
------------------------------------------------------------
*/

app.delete(
    "/api/sos/:id",
    authenticateToken,
    async (req, res) => {

        try {

            const emergency =
                await SOSEvent.findOneAndDelete({

                    _id: req.params.id,

                    userId: req.user.userId

                });

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
                    "SOS deleted successfully."

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    "Unable to delete SOS."

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




/* ============================================================
   START GUARDIAN SOS SERVER
============================================================ */

if (process.env.VERCEL !== "1") {

    httpServer.listen(
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
                `https://guardian-sos-1920.vercel.app`
            );

            console.log(
                "Real-time chat server is ready."
            );

            console.log(
                "========================================"
            );

        }
    );

}
module.exports = httpServer;




