import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, RecaptchaVerifier } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCs378LldkmXoZ3w9aPQEj-gJ1XgzFzhD0",
  authDomain: "consignment-store-4a564.firebaseapp.com",
  projectId: "consignment-store-4a564",
  storageBucket: "consignment-store-4a564.firebasestorage.app",
  messagingSenderId: "723799732977",
  appId: "1:723799732977:web:fa12372a7a91682807af50",
  measurementId: "G-K6DPX8D0SD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, analytics, db, auth, storage, googleProvider, RecaptchaVerifier }; 