// Firebase configuration for ratingwebapp
const firebaseConfig = {
  apiKey: "AIzaSyBD7o39Rvk1XGBt4SjLNRfAXBN0A5TChY8",
  authDomain: "ratingwebapp.firebaseapp.com",
  projectId: "ratingwebapp",
  storageBucket: "ratingwebapp.firebasestorage.app",
  messagingSenderId: "695929950108",
  appId: "1:695929950108:web:8f097b337361234de28259",
  measurementId: "G-J1DLYNDKKP"
};

// Initialize Firebase (using compat version for simplicity with current app.js)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

console.log('Firebase initialized for GG FC Rating System');