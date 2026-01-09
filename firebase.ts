import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Config from the provided code
const firebaseConfig = {
    apiKey: "AIzaSyAveYs39hNvovZ18bXD5RFQaAEl5O7ZC44",
    authDomain: "test-8ec04.firebaseapp.com",
    projectId: "test-8ec04",
    storageBucket: "test-8ec04.appspot.com",
    messagingSenderId: "281610185015",
    appId: "1:281610185015:web:923343355512a0c47752b2",
    measurementId: "G-VZCZYS7B6J"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Helper to get App ID from URL or default
export const getAppId = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('app') || 'default-app-id';
};