import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  createDefaultAuthenticateWithFacebook,
  resolveFacebookSignInAlert,
  shouldSuppressFacebookSignInAlert,
  SocialAuthError,
  sanitizeSocialErrorForLog,
  FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY,
  beginFacebookAuthTrace,
  describeErrorForTrace,
  flushFacebookAuthTrace,
  summarizeFacebookAuthTrace,
  traceFacebookAuth,
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
    beginFacebookAuthTrace();
    try {
      const result = await authenticateWithFacebook();
      flushFacebookAuthTrace('success');
      if (__DEV__) setTimeout(() => flushFacebookAuthTrace('success_delayed'), 2000);

      Keyboard.dismiss();
      setTimeout(() => {
        void applyPostAuthNavigation(navigation, {
          uid: result.session.uid,
          email: result.email ?? result.session.email ?? '',
        });
      }, 150);
    } catch (err) {
      traceFacebookAuth(
        'ui_error',
        err instanceof SocialAuthError
          ? { socialCode: err.social.code, diagnosticCode: err.social.diagnosticCode }
          : { socialCode: 'NON_SOCIAL_ERROR', ...describeErrorForTrace(err) },
      );
      const devSuffix = summarizeFacebookAuthTrace();
      flushFacebookAuthTrace('ui_error');
      // Re-emit once the dev log socket is back after the Facebook sheet.
      if (__DEV__) setTimeout(() => flushFacebookAuthTrace('ui_error_delayed'), 2000);
      const withDevSuffix = (message: string) =>
        devSuffix ? `${message}\n\n${devSuffix}` : message;

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

        const { titleKey, messageKey } = resolveFacebookSignInAlert(err.social);
        Alert.alert(t(titleKey as any), withDevSuffix(t(messageKey as any)));
        return;
      }

      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        withDevSuffix(t(FACEBOOK_SIGN_IN_FAILED_MESSAGE_KEY as any)),
      );
    } finally {
      setSubmitting(false);
    }
  }, [navigation, submitting, t]);

  return { signInWithFacebook, facebookSubmitting: submitting };
}
