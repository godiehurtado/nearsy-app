import { firebaseAuth } from '../config/firebaseConfig';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export async function reauthWithPassword(password: string) {
  const user = firebaseAuth.currentUser;
  const email = user?.email;

  if (!user || !email) {
    throw new Error('User session is not available. Please log in again.');
  }

  const cred = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(user, cred);
}
