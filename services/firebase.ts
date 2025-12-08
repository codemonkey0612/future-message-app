// FIX: Changed firebase imports for v8 compatibility.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';

// IMPORTANT: Replace with your actual Firebase project configuration.
// You can find this in your Firebase project settings.
const firebaseConfig = {
 apiKey: "AIzaSyBHT8pDHTO7F2C30NO8feeP5eQjFyLIquQ",
  authDomain: "futuremessage-app.firebaseapp.com",
  projectId: "futuremessage-app",
  storageBucket: "futuremessage-app.firebasestorage.app",
  messagingSenderId: "1098464730836",
  appId: "1:1098464730836:web:2257fb08f717e3dc236541"
};

// Firebase configuration is set up correctly
// All required fields are configured for the futuremessage-app project


// Initialize Firebase
// FIX: Used v8 firebase.initializeApp method.
const app = firebase.initializeApp(firebaseConfig);

// Get Firebase services
// FIX: Used v8 firebase.auth() and firebase.firestore() methods.
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions();

export { auth, db, storage, functions };