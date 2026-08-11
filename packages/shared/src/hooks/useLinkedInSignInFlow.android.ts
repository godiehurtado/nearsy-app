import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  LinkedInAuthError,
  signInWithLinkedInBrowser,
} from '../authentication/linkedin/linkedinAuth.android';
import { getUserProfile, isProfileComplete } from '../services/firestoreService';
import { clearPendingSocialProfilePrefill } from '../authentication/social';

/**
 * Android Development LinkedIn → Firebase session → profile routing.
 * Mirrors useGoogleSignInFlow. iOS / other platforms must not call this.
 */
export function useLinkedInSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithLinkedIn = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (submitting) return;
    // Defense in depth: never start LinkedIn outside Development Firebase.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isNearsyFirebaseDevelopment } = require('../config/nearsyFirebaseEnv');
    if (!isNearsyFirebaseDevelopment()) return;

    setSubmitting(true);
    try {
      if (__DEV__) {
        console.log('[useLinkedInSignInFlow] stage: start');
      }
      const result = await signInWithLinkedInBrowser();
      if (__DEV__) {
        console.log('[useLinkedInSignInFlow] stage:', result.status);
      }

      if (
        result.status === 'cancelled' ||
        result.status === 'dismissed' ||
        result.status === 'ignored' ||
        result.status === 'session_already_active'
      ) {
        return;
      }

      if (result.status === 'provider_error') {
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.comingSoonMessage'),
        );
        return;
      }

      if (result.status === 'failed' || result.status === 'uncertain') {
        const err = result.error;
        if (__DEV__) {
          console.log('[useLinkedInSignInFlow]', {
            code: err.code,
            httpsErrorCode: err.httpsErrorCode,
            backendCode: err.backendCode,
            message: err.message,
          });
        }
        if (
          err.code === 'APP_CHECK_NOT_READY' ||
          err.code === 'CORE_DISABLED' ||
          err.code === 'FIREBASE_AUTH_NOT_READY'
        ) {
          Alert.alert(
            t('authentication.login.alerts.loginErrorTitle'),
            err.message,
          );
          return;
        }
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.google.errors.generic'),
        );
        return;
      }

      if (result.status === 'session_changed_during_flow') {
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.google.errors.generic'),
        );
        return;
      }

      if (result.status !== 'authenticated') {
        return;
      }

      const uid = result.session.uid;
      const profile: any = await getUserProfile(uid);
      const emailForProfile =
        typeof profile?.email === 'string' ? profile.email : '';

      Keyboard.dismiss();

      if (!profile) {
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'ProfileCompletion',
                params: {
                  uid,
                  email: emailForProfile,
                  inputNonce: Date.now(),
                },
              },
            ],
          });
        }, 150);
        return;
      }

      const complete = await isProfileComplete(uid);

      setTimeout(() => {
        if (complete) {
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
                uid,
                email: emailForProfile,
                inputNonce: Date.now(),
              },
            },
          ],
        });
      }, 150);
    } catch (err) {
      if (err instanceof LinkedInAuthError) {
        if (__DEV__) {
          console.log('[useLinkedInSignInFlow]', { code: err.code });
        }
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          err.message,
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

  return { signInWithLinkedIn, linkedInSubmitting: submitting };
}
