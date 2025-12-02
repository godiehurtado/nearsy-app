// src/services/authService.ts
import { auth } from '../config/firebaseConfig';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';

// Envía email de verificación al usuario dado
const sendVerificationEmail = async (user: User) => {
  try {
    await sendEmailVerification(user);
  } catch (error) {
    if (__DEV__) {
      console.error('[Auth] Error sending verification email:', error);
    }
    // No lanzamos error hacia arriba para no romper el flujo de registro
  }
};

export const registerWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
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

export const loginWithEmail = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password,
    );

    // Asegurarnos de tener el estado más reciente del usuario
    await userCredential.user.reload();

    if (!userCredential.user.emailVerified) {
      // Lanzamos un error con código propio para que la UI lo maneje
      const error: any = new Error('Email not verified');
      error.code = 'auth/email-not-verified';
      throw error;
    }

    return userCredential;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error logging in:', error);
    }
    throw error;
  }
};

export const sendPasswordReset = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error sending password reset email:', error);
    }
    throw error;
  }
};
