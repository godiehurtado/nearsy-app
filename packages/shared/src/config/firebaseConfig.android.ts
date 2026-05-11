// packages/shared/src/config/firebaseConfig.android.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

export const firebaseAuth = auth();
export const firestoreDb = firestore();
export const storageWeb = storage();
