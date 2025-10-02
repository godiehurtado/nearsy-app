// App.tsx
import './src/background/locationTask'; // 👈 registra la Task al boot (import temprano)
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from './src/services/backgroundLocation';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from './src/config/firebaseConfig';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    // Arranca / detiene BG location según la sesión
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      if (Platform.OS === 'web') return; // ❎ no aplica BG en web
      try {
        if (user) {
          const snap = await getDoc(doc(firestore, 'users', user.uid));
          const bgVisible = snap.exists() ? !!snap.data()?.bgVisible : false;
          if (bgVisible) {
            await startBackgroundLocation({ uid: user.uid });
          } else {
            await stopBackgroundLocation().catch(() => {});
          }
        } else {
          await stopBackgroundLocation().catch(() => {});
        }
      } catch (e) {
        console.warn('BG location start/stop error:', e);
      }
    });

    return () => unsub();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
