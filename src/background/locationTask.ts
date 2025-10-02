// src/background/locationTask.ts
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

// Define un tipo local para el payload de la task
type LocationTaskData = {
  locations?: Location.LocationObject[]; // <- usa LocationObject[]
};

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      console.warn('BG location task error:', error);
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations || locations.length === 0) return;

    const uid = await AsyncStorage.getItem('NEARSY_BG_UID');
    if (!uid) return;

    const fix = locations[locations.length - 1];
    const { latitude, longitude } = fix.coords;

    await setDoc(
      doc(firestore, 'users', uid),
      {
        location: { lat: latitude, lng: longitude, updatedAt: Date.now() },
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn('BG location persist error:', e);
  }
});
