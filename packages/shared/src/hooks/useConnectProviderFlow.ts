import { useCallback, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useTranslation } from '../i18n';
import {
  AccountLinkError,
  createDefaultLinkProviderToCurrentUser,
  LINKABLE_PROVIDER_DISPLAY_NAMES,
  resolveAccountLinkAlert,
  shouldSuppressAccountLinkAlert,
  type LinkableProvider,
} from '../authentication/social';

const linkProviderToCurrentUser = createDefaultLinkProviderToCurrentUser();

/**
 * Settings → Sign-in methods → "Connect Google / Apple / Facebook".
 * Explicit, confirmed linking to the signed-in account only; one attempt at a
 * time across all providers.
 */
export function useConnectProviderFlow(onSettled: () => void) {
  const { t } = useTranslation();
  const [connectingProvider, setConnectingProvider] = useState<LinkableProvider | null>(null);
  const busyRef = useRef(false);

  const confirmFor = useCallback(
    (provider: LinkableProvider) => () =>
      new Promise<boolean>((resolve) => {
        const params = { provider: LINKABLE_PROVIDER_DISPLAY_NAMES[provider] };
        Alert.alert(
          t('settings.signInMethods.confirm.title', params),
          t('settings.signInMethods.confirm.message', params),
          [
            {
              text: t('settings.signInMethods.confirm.cancel'),
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: t('settings.signInMethods.confirm.continue'),
              onPress: () => {
                setConnectingProvider(provider);
                resolve(true);
              },
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );

  const connectProvider = useCallback(
    async (provider: LinkableProvider) => {
      if (busyRef.current) return;
      if (Platform.OS !== 'ios') return;
      busyRef.current = true;
      try {
        const outcome = await linkProviderToCurrentUser(provider, {
          confirm: confirmFor(provider),
        });
        if (outcome.status === 'linked') {
          Alert.alert(
            t(`settings.signInMethods.success.${provider}.title` as any),
            t(`settings.signInMethods.success.${provider}.message` as any),
          );
        } else {
          const params = { provider: LINKABLE_PROVIDER_DISPLAY_NAMES[provider] };
          Alert.alert(
            t('settings.signInMethods.alreadyLinked.title', params),
            t('settings.signInMethods.alreadyLinked.message', params),
          );
        }
      } catch (err) {
        if (err instanceof AccountLinkError) {
          if (shouldSuppressAccountLinkAlert(err.code)) return;
          const { titleKey, messageKey, params } = resolveAccountLinkAlert(err);
          Alert.alert(t(titleKey as any, params), t(messageKey as any, params));
          return;
        }
        const params = { provider: LINKABLE_PROVIDER_DISPLAY_NAMES[provider] };
        Alert.alert(
          t('settings.signInMethods.errors.title', params),
          t('settings.signInMethods.errors.unknown', params),
        );
      } finally {
        busyRef.current = false;
        setConnectingProvider(null);
        onSettled();
      }
    },
    [confirmFor, onSettled, t],
  );

  return { connectProvider, connectingProvider };
}
