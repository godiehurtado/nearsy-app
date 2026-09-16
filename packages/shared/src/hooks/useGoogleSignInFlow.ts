import { useCallback, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  authenticateWithGoogle,
  GoogleAuthenticationError,
} from '../authentication/authenticateWithGoogle';
import { getUserProfile, isProfileComplete } from '../services/firestoreService';
import { clearPendingSocialProfilePrefill } from '../authentication/social';

/**
 * Shared Google sign-in -> Firebase -> existing profile routing (Android).
 * Used by Login and Welcome — wraps the Android `authenticateWithGoogle`
 * use case (RNFirebase + native Google Sign-In) rather than reimplementing
 * the SDK. Incomplete profiles enter ProfileCompletion (CRJ), not MainTabs.
 */
export function useGoogleSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithGoogle = useCallback(async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      const result = await authenticateWithGoogle();

      const profile: any = await getUserProfile(result.uid);
      const emailForProfile = result.email ?? '';

      Keyboard.dismiss();

      if (!profile) {
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'ProfileCompletion',
                params: {
                  uid: result.uid,
                  email: emailForProfile,
                  inputNonce: Date.now(),
                },
              },
            ],
          });
        }, 150);
        return;
      }

      const complete = await isProfileComplete(result.uid);

      setTimeout(() => {
        if (complete) {
          // Drop any pending Google prefill so it cannot leak onto a later incomplete session.
          clearPendingSocialProfilePrefill();
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
          return;
        }

        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'ProfileCompletion',
              params: {
                uid: result.uid,
                email: emailForProfile,
                inputNonce: Date.now(),
              },
            },
          ],
        });
      }, 150);
    } catch (err) {
      if (err instanceof GoogleAuthenticationError) {
        if (__DEV__) {
          console.log('[useGoogleSignInFlow]', {
            code: err.code,
            diagnosticCode: err.diagnosticCode,
          });
        }

        if (err.code === 'CANCELLED' || err.code === 'OPERATION_IN_PROGRESS') {
          return;
        }

        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t(err.messageKey as any),
        );
        return;
      }

      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        t('authentication.social.google.errors.generic'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [navigation, submitting, t]);

  return { signInWithGoogle, googleSubmitting: submitting };
}
