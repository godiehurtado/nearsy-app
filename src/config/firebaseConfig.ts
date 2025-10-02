// src/config/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ✅ Tu configuración de Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyBv7UEL1aDLKIZRBnLZ2kuEitHmikhmqfA',
  authDomain: 'nearsy-pj.firebaseapp.com',
  projectId: 'nearsy-pj',
  storageBucket: 'nearsy-pj.firebasestorage.app',
  messagingSenderId: '557470198780',
  appId: '1:557470198780:web:05fe20ad2e594dc0596079',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const firestore = getFirestore(app, 'nearsy-db');
export const storage = getStorage(app);
