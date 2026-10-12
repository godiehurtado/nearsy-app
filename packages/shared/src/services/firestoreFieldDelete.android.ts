import firestore from '@react-native-firebase/firestore';

/** Sentinel that removes a field in a merge write (`set(..., { merge: true })`). */
export function firestoreDeleteField(): unknown {
  return firestore.FieldValue.delete();
}
