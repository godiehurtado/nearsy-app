// packages/shared/src/services/authService.ios.ts ✅ Firebase Web SDK

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  reload,
} from 'firebase/auth';

import { firebaseAuth } from '../config/firebaseConfig.ios';

// ✅ Registro
export const registerWithEmail = async (email: string, password: string) => {
  const cred = await createUserWithEmailAndPassword(
    firebaseAuth as any,
    email,
    password,
  );

  // email verification
  try {
    await sendEmailVerification(cred.user);
  } catch {}

  return cred;
};

// ✅ Login
export const loginWithEmail = async (email: string, password: string) => {
  const cred = await signInWithEmailAndPassword(
    firebaseAuth as any,
    email,
    password,
  );

  // refrescar user
  await reload(cred.user);

  // iOS exige email verificado (como ya lo querías)
  if (!(cred.user as any).emailVerified) {
    const err: any = new Error('Email not verified');
    err.code = 'auth/email-not-verified';
    throw err;
  }

  return cred;
};

// ✅ Reset password
export const sendPasswordReset = async (email: string) => {
  return sendPasswordResetEmail(firebaseAuth as any, email);
};
