importScripts(
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js"
);

importScripts(
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js"
);


firebase.initializeApp({

    apiKey:
        "YOUR_API_KEY",

    authDomain:
        "YOUR_PROJECT.firebaseapp.com",

    projectId:
        "YOUR_PROJECT_ID",

    storageBucket:
        "YOUR_STORAGE_BUCKET",

    messagingSenderId:
        "YOUR_MESSAGING_SENDER_ID",

    appId:
        "YOUR_APP_ID"

});


const messaging =
    firebase.messaging();


messaging.onBackgroundMessage(
    function(payload) {

        console.log(
            "Background SOS message:",
            payload
        );


        const title =
            payload.notification?.title ||
            "🚨 GUARDIAN SOS ALERT";


        const options = {

            body:
                payload.notification?.body ||
                "Emergency SOS activated.",

            requireInteraction:
                true

        };


        self.registration.showNotification(
            title,
            options
        );

    }
);