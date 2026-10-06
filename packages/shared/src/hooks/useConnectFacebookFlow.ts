import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from '../i18n';
import {
  createDefaultLinkFacebookToCurrentUser,
  FacebookLinkError,
  resolveFacebookLinkAlert,
  shouldSuppressFacebookLinkAlert,
} from '../authentication/social';

const linkFacebookToCurrentUser = createDefaultLinkFacebookToCurrentUser();

/**
 * Settings → Sign-in methods → "Connect Facebook".
 * Explicit, confirmed linking to the signed-in account only.
 */
export function useConnectFacebookFlow(onSettled: () => void) {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);
  const busyRef = useRef(false);

  const confirm = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        Alert.alert(
          t('settings.signInMethods.confirm.title'),
          t('settings.signInMethods.confirm.message'),
          [
            {
              text: t('settings.signInMethods.confirm.cancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: t('settings.signInMethods.confirm.continue'),
              onPress: () => {
                setConnecting(true);
                resolve(true);
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );

  const connectFacebook = useCallback(async () => {
    if (busyRef.current) return;
    if (Platform.OS !== 'ios') return;
    busyRef.current = true;
    try {
      const outcome = await linkFacebookToCurrentUser({ confirm });
      const copy =
        outcome.status === 'linked'
          ? 'settings.signInMethods.success'
          : 'settings.signInMethods.alreadyLinked';
      Alert.alert(t(`${copy}.title` as any), t(`${copy}.message` as any));
    } catch (err) {
      if (err instanceof FacebookLinkError) {
        if (shouldSuppressFacebookLinkAlert(err.code)) return;
        const { titleKey, messageKey } = resolveFacebookLinkAlert(err);
        Alert.alert(t(titleKey as any), t(messageKey as any));
        return;
      }
      Alert.alert(
        t('settings.signInMethods.errors.title'),
        t('settings.signInMethods.errors.unknown'),
      );
    } finally {
      busyRef.current = false;
      setConnecting(false);
      onSettled();
    }
  }, [confirm, onSettled, t]);

  return { connectFacebook, connecting };
}
