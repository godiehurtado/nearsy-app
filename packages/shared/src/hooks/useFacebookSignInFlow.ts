import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  createDefaultAuthenticateWithFacebook,
  resolveFacebookSignInAlertMessageKey,
  shouldSuppressFacebookSignInAlert,
  SocialAuthError,
  sanitizeSocialErrorForLog,
  FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY,
} from '../authentication/social';
import { applyPostAuthNavigation } from '../phoneOtp/applyPostAuthNavigation';

const authenticateWithFacebook = createDefaultAuthenticateWithFacebook();

/**
 * Shared Facebook Login → Firebase → central onboarding routing.
 * Used by Login and Welcome — mirrors useGoogleSignInFlow / useAppleSignInFlow.
 */
export function useFacebookSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithFacebook = useCallback(async () => {
    if (submitting) return;
    if (Platform.OS !== 'ios') {
      Alert.alert(
        t('authentication.social.comingSoonTitle'),
        t('authentication.social.comingSoonMessage'),
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await authenticateWithFacebook();

      Keyboard.dismiss();
      setTimeout(() => {
        void applyPostAuthNavigation(navigation, {
          uid: result.session.uid,
          email: result.email ?? result.session.email ?? '',
        });
      }, 150);
    } catch (err) {
      if (err instanceof SocialAuthError) {
        if (__DEV__) {
          console.log(
            '[useFacebookSignInFlow]',
            sanitizeSocialErrorForLog(err.social),
          );
        }

        if (shouldSuppressFacebookSignInAlert(err.social.code)) {
          return;
        }

        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t(resolveFacebookSignInAlertMessageKey(err.social) as any),
        );
        return;
      }

      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        t(FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY as any),
      );
    } finally {
      setSubmitting(false);
    }
  }, [navigation, submitting, t]);

  return { signInWithFacebook, facebookSubmitting: submitting };
}
