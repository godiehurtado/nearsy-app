import { useCallback, useRef, useState } from 'react';
import { Alert, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from '../i18n';
import { runFacebookSignIn } from '../authentication/facebook/facebookSignInFlow';
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
      const outcome = await runFacebookSignIn({
        authenticate: authenticateWithFacebook,
        getUserProfile,
        isProfileComplete,
      });

      switch (outcome.kind) {
        case 'ignored':
          return;
        case 'alert':
          Alert.alert(
            t(outcome.alert.titleKey as any),
            t(outcome.alert.messageKey as any),
          );
          return;
        case 'mainTabs':
          Keyboard.dismiss();
          setTimeout(() => {
            clearPendingSocialProfilePrefill();
            navigation.reset({
              index: 0,
              routes: [{ name: 'MainTabs' }],
            });
          }, 150);
          return;
        case 'profileCompletion':
          Keyboard.dismiss();
          setTimeout(() => {
            navigation.reset({
              index: 0,
              routes: [
                {
                  name: 'ProfileCompletion',
                  params: {
                    uid: outcome.uid,
                    email: outcome.email,
                    inputNonce: Date.now(),
                  },
                },
              ],
            });
          }, 150);
          return;
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [navigation, t]);

  return { signInWithFacebook, facebookSubmitting: submitting };
}
