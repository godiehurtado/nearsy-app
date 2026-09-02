import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  createDefaultAuthenticateWithApple,
  SocialAuthError,
  sanitizeSocialErrorForLog,
} from '../authentication/social';
import { applyPostAuthNavigation } from '../phoneOtp/applyPostAuthNavigation';
import { shouldSuppressAppleSignInAlert } from '../authentication/social/application/appleSignInUiPolicy';

const authenticateWithApple = createDefaultAuthenticateWithApple();

export {
  resolveAppleAuthNavigationTarget,
  shouldSuppressAppleSignInAlert,
} from '../authentication/social/application/appleSignInUiPolicy';

/**
 * Shared Apple sign-in → Firebase → CRJ / MainTabs routing.
 * Used by Login and Welcome — mirrors useGoogleSignInFlow.
 */
export function useAppleSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithApple = useCallback(async () => {
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
      const result = await authenticateWithApple();

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
            '[useAppleSignInFlow]',
            sanitizeSocialErrorForLog(err.social),
          );
        }

        if (shouldSuppressAppleSignInAlert(err.social.code)) {
          return;
        }

        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t(err.social.messageKey as any),
        );
        return;
      }

      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        t('authentication.social.errors.generic'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [navigation, submitting, t]);

  return { signInWithApple, appleSubmitting: submitting };
}
