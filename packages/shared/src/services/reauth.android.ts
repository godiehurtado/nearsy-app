import auth from '@react-native-firebase/auth';
import { firebaseAuth } from '../config/firebaseConfig.android';

export async function reauthWithPassword(password: string) {
  const user = firebaseAuth.currentUser;
  const email = user?.email;

  if (!user || !email) {
    throw new Error('User session is not available. Please log in again.');
  }

  const cred = auth.EmailAuthProvider.credential(email, password);
  await user.reauthenticateWithCredential(cred);
}
