import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from '../i18n';
import {
  DIRECT_LOGIN_WARNING_BACK_KEY,
  DIRECT_LOGIN_WARNING_CONTINUE_KEYS,
  DIRECT_LOGIN_WARNING_MESSAGE_KEY,
  DIRECT_LOGIN_WARNING_TITLE_KEY,
  type DirectLoginWarningProvider,
} from '../authentication/social/application/directProviderLoginWarning';

/**
 * Login-only confirmation before Google / Apple. Resolves `true` only when the
 * user taps Continue; Go back / dismiss resolve `false`. A second tap while the
 * dialog is open resolves `false` without opening another dialog.
 */
export function useDirectProviderLoginWarning() {
  const { t } = useTranslation();
  const openRef = useRef(false);

  const confirmDirectProviderLogin = useCallback(
    (provider: DirectLoginWarningProvider) => {
      if (openRef.current) return Promise.resolve(false);
      openRef.current = true;
      return new Promise<boolean>((resolve) => {
        const settle = (value: boolean) => {
          openRef.current = false;
          resolve(value);
        };
        Alert.alert(
          t(DIRECT_LOGIN_WARNING_TITLE_KEY as any),
          t(DIRECT_LOGIN_WARNING_MESSAGE_KEY as any),
          [
            {
              text: t(DIRECT_LOGIN_WARNING_BACK_KEY as any),
              style: 'cancel',
              onPress: () => settle(false),
            },
            {
              text: t(DIRECT_LOGIN_WARNING_CONTINUE_KEYS[provider] as any),
              onPress: () => settle(true),
            },
          ],
          { cancelable: true, onDismiss: () => settle(false) },
        );
      });
    },
    [t],
  );

  return { confirmDirectProviderLogin };
}
