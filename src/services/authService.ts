// src/services/authService.ts  ✅ RNFirebase-only (centralized instance)

import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig';

// Alias opcional para que sea más legible
type RNUser = FirebaseAuthTypes.User;
type RNUserCredential = FirebaseAuthTypes.UserCredential;

// Envía email de verificación al usuario dado
const sendVerificationEmail = async (user: RNUser) => {
  try {
    await user.sendEmailVerification();
  } catch (error) {
    if (__DEV__) {
      console.error('[Auth] Error sending verification email:', error);
    }
    // No lanzamos error hacia arriba para no romper el flujo de registro
  }
};

export const registerWithEmail = async (
  email: string,
  password: string,
): Promise<RNUserCredential> => {
  try {
    const userCredential = await firebaseAuth.createUserWithEmailAndPassword(
      email,
      password,
    );

    // Enviar email de verificación
    await sendVerificationEmail(userCredential.user);

    return userCredential;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error registering user:', error);
    }
    throw error;
  }
};

export const loginWithEmail = async (
  email: string,
  password: string,
): Promise<RNUserCredential> => {
  try {
    const userCredential = await firebaseAuth.signInWithEmailAndPassword(
      email,
      password,
    );

    // Asegurarnos de tener el estado más reciente del usuario
    await userCredential.user.reload();

    if (!userCredential.user.emailVerified) {
      const err: any = new Error('Email not verified');
      err.code = 'auth/email-not-verified';
      throw err;
    }

    return userCredential;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error logging in:', error);
      console.log('Firestore error code =>', error?.code);
      console.log('Firestore error msg  =>', error?.message);
    }
    throw error;
  }
};

export const sendPasswordReset = async (email: string) => {
  try {
    await firebaseAuth.sendPasswordResetEmail(email);
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error sending password reset email:', error);
    }
    throw error;
  }
};
