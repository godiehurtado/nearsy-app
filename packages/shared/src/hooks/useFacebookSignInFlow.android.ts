import { useCallback, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import { FacebookAuthenticationError } from '../authentication/facebook/facebookAuthCore';
import { authenticateWithFacebook } from '../services/facebookSession.android';
import { getUserProfile, isProfileComplete } from '../services/firestoreService';
import { clearPendingSocialProfilePrefill } from '../authentication/social';

/**
 * Android Facebook Login → Firebase session → existing profile routing.
 * Mirrors useGoogleSignInFlow: complete profile → MainTabs; new or incomplete
 * → ProfileCompletion (DOB → OTP → CRJ gate). Prefill is committed by the
 * use case before this hook routes.
 */
export function useFacebookSignInFlow() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const signInWithFacebook = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await authenticateWithFacebook();

      const profile: any = await getUserProfile(result.uid);
      const emailForProfile = result.email ?? '';

      Keyboard.dismiss();

      const goToProfileCompletion = () => {
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
      };

      if (!profile) {
        setTimeout(goToProfileCompletion, 150);
        return;
      }

      const complete = await isProfileComplete(result.uid);

      setTimeout(() => {
        if (complete) {
          clearPendingSocialProfilePrefill();
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
          return;
        }
        goToProfileCompletion();
      }, 150);
    } catch (err) {
      if (err instanceof FacebookAuthenticationError) {
        if (__DEV__) {
          console.log('[useFacebookSignInFlow]', {
            code: err.code,
            diagnosticCode: err.diagnosticCode,
          });
        }
        if (err.code === 'OPERATION_IN_PROGRESS') return;
        Alert.alert(
          t('authentication.login.social.facebook'),
          t(err.messageKey as any),
        );
        return;
      }

      Alert.alert(
        t('authentication.login.social.facebook'),
        t('authentication.social.facebook.errors.generic'),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [navigation, t]);

  return { signInWithFacebook, facebookSubmitting: submitting };
}
