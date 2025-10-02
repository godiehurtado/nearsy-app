// src/services/authService.ts
import { auth } from '../config/firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';

export const registerWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password,
    );
    console.log('✅ Usuario registrado:', userCredential.user.uid);
    return userCredential;
  } catch (error: any) {
    console.error('❌ Error al registrar usuario:', error);
    throw error;
  }
};

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );
    console.log('✅ Sesión iniciada:', userCredential.user.uid);
    return userCredential;
  } catch (error: any) {
    console.error('❌ Error al iniciar sesión:', error);
    throw error;
  }
};
