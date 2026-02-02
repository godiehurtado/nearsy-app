// src/config/firebaseConfig.ts  ✅ RNFirebase-only

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// ✅ Auth (RNFirebase)
export const firebaseAuth = auth();

// ✅ Firestore (RNFirebase)
export const firestoreDb = firestore();

// ✅ Storage (RNFirebase)
export const storageBucket = storage();

// alias opcional
export const bucket = storageBucket;
