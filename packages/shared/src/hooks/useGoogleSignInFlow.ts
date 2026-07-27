import { useCallback, useState } from 'react';
import { Alert, Keyboard, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import {
  createDefaultAuthenticateWithGoogle,
  SocialAuthError,
  sanitizeSocialErrorForLog,
} from '../authentication/social';

const authenticateWithGoogle = createDefaultAuthenticateWithGoogle();

/**
 * Shared Google sign-in → Firebase → existing profile routing.
 * Used by Login and Welcome — does not reimplement Google Auth.
 * Incomplete profiles enter ProfileCompletion (CRJ), not MainTabs.
 */
export function useGoogleSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const signInWithGoogle = useCallback(async () => {
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
      const result = await authenticateWithGoogle();

      Keyboard.dismiss();
      setTimeout(() => {
        if (result.profileRoute === 'MainTabs') {
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
      if (err instanceof SocialAuthError) {
        if (__DEV__) {
          console.log(
            '[useGoogleSignInFlow]',
            sanitizeSocialErrorForLog(err.social),
          );
        }

        if (
          err.social.code === 'CANCELLED' ||
          err.social.code === 'IN_PROGRESS'
        ) {
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

  return { signInWithGoogle, googleSubmitting: submitting };
}
