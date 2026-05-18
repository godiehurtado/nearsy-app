// src/services/authService.ts  ✅ Cross-platform (iOS Web SDK + Android RNFirebase)
import { Platform } from 'react-native';
import { firebaseAuth } from '../config/firebaseConfig.android';

// Tipos suaves (para que compile con ambos SDKs)
type AnyUser = any;
type AnyUserCredential = any;

// Envía email de verificación al usuario dado
const sendVerificationEmail = async (user: AnyUser) => {
  try {
    // Web SDK: user.sendEmailVerification()
    // RNFirebase: user.sendEmailVerification()
    await user.sendEmailVerification();
  } catch (error) {
    if (__DEV__) {
      console.error('[Auth] Error sending verification email:', error);
    }
    // No rompemos el flujo
  }
};

export const registerWithEmail = async (
  email: string,
  password: string,
): Promise<AnyUserCredential> => {
  try {
    const userCredential = await (
      firebaseAuth as any
    ).createUserWithEmailAndPassword(email, password);

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
): Promise<AnyUserCredential> => {
  try {
    const userCredential = await (
      firebaseAuth as any
    ).signInWithEmailAndPassword(email, password);

    // Web SDK: await user.reload()
    // RNFirebase: await user.reload()
    if (userCredential?.user?.reload) {
      await userCredential.user.reload();
    }

    // ✅ Solo iOS exige email verificado
    // (En Android tu flujo principal es SMS/phone verification)
    if (
      Platform.OS === 'ios' &&
      userCredential?.user &&
      userCredential.user.emailVerified === false
    ) {
      const err: any = new Error('Email not verified');
      err.code = 'auth/email-not-verified';
      throw err;
    }

    return userCredential;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error logging in:', error);
      console.log('Auth error code =>', error?.code);
      console.log('Auth error msg  =>', error?.message);
    }
    throw error;
  }
};

export const sendPasswordReset = async (email: string) => {
  try {
    await (firebaseAuth as any).sendPasswordResetEmail(email);
  } catch (error: any) {
    if (__DEV__) {
      console.error('[Auth] Error sending password reset email:', error);
    }
    throw error;
  }
};
