import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  isLinkedInA3SignInEnabledForRuntime,
  signInWithLinkedInA3,
} from '../authentication/linkedinA3/authenticateWithLinkedIn';
import { LinkedInA3ClientError } from '../authentication/linkedinA3/sanitize';
import { resolveAppleAuthNavigationTarget } from '../authentication/social/application/appleSignInUiPolicy';

/**
 * iOS Development LinkedIn A3 → Firebase session → profile routing.
 * Mirrors useGoogleSignInFlow / useAppleSignInFlow navigation.
 * Does not modify ProfileCompletion / registration screens.
 */
export function useLinkedInSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithLinkedIn = useCallback(async () => {
    if (submitting) return;
    if (Platform.OS !== 'ios') {
      Alert.alert(
        t('authentication.social.comingSoonTitle'),
        t('authentication.social.comingSoonMessage'),
      );
      return;
    }
    if (!isLinkedInA3SignInEnabledForRuntime()) {
      Alert.alert(
        t('authentication.social.comingSoonTitle'),
        t('authentication.social.comingSoonMessage'),
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await signInWithLinkedInA3();

      if (
        result.status === 'cancelled' ||
        result.status === 'dismissed' ||
        result.status === 'session_already_active'
      ) {
        return;
      }

      if (result.status === 'expired') {
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.errors.generic'),
        );
        return;
      }

      if (result.status === 'provider_error') {
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.errors.generic'),
        );
        return;
      }

      if (result.status === 'failed') {
        const err = result.error;
        if (__DEV__ && err instanceof LinkedInA3ClientError) {
          console.log('[useLinkedInSignInFlow]', {
            code: err.code,
            causeCode: err.causeCode,
          });
        }
        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t('authentication.social.errors.generic'),
        );
        return;
      }

      if (result.status !== 'authenticated') {
        return;
      }

      Keyboard.dismiss();
      setTimeout(() => {
        const screen = resolveAppleAuthNavigationTarget(result.profileRoute);
        if (screen === 'MainTabs') {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
          return;
        }

        const emailForProfile = result.email ?? result.session.email ?? '';
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'ProfileCompletion',
              params: {
                uid: result.session.uid,
                email: emailForProfile,
                inputNonce: Date.now(),
              },
            },
          ],
        });
      }, 150);
    } catch (err) {
      if (__DEV__) {
        console.log(
          '[useLinkedInSignInFlow]',
          err instanceof LinkedInA3ClientError ? err.code : 'unknown',
        );
      }
      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        t('authentication.social.errors.generic'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [navigation, submitting, t]);

  return { signInWithLinkedIn, linkedInSubmitting: submitting };
}
