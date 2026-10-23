/**
 * NEARSY-209 Android — Instagram reverse-DM ownership card scoped to the
 * Own Profile mode being edited. Start / Get / Unlink only. No inbox admin.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  AppState,
  Share,
  Linking,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import {
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
  type InstagramOwnershipGetResponse,
  type InstagramOwnershipPending,
  type InstagramOwnershipUnlinkResponse,
  type InstagramOwnershipVerified,
} from '../../social/instagramOwnership/instagramOwnershipContract.ts';
import {
  InstagramOwnershipError,
  instagramOwnershipErrorToI18nKey,
} from '../../social/instagramOwnership/instagramOwnershipCore.ts';
import {
  buildInstagramOwnershipModeView,
  instagramOwnershipActionBlocked,
  instagramOwnershipHandleLabel,
  presentInstagramGetResponse,
  shouldPollInstagramOwnership,
  type InstagramOwnershipHint,
  type InstagramOwnershipUiPhase,
} from '../../social/instagramOwnership/instagramOwnershipPresentation.ts';

type InstagramApi = {
  startInstagramOwnership: (
    mode: ProfileMode,
  ) => Promise<InstagramOwnershipPending>;
  getInstagramOwnershipState: (
    mode: ProfileMode,
  ) => Promise<InstagramOwnershipGetResponse>;
  unlinkInstagramOwnership: (
    mode: ProfileMode,
  ) => Promise<InstagramOwnershipUnlinkResponse>;
};

function loadInstagramApi(): InstagramApi | null {
  if (Platform.OS !== 'android') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../social/instagramOwnership/instagramOwnership') as InstagramApi;
}

type Props = {
  mode: ProfileMode;
  legacyUrl?: string;
  glyph: React.ReactNode;
  label: string;
  onConnectedChange?: (connected: boolean) => void;
};

export function InstagramOwnershipCard({
  mode,
  legacyUrl,
  glyph,
  label,
  onConnectedChange,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const api = loadInstagramApi();
  const screenFocused = useIsFocused();

  const [phase, setPhase] = useState<InstagramOwnershipUiPhase>('loading');
  const [verified, setVerified] = useState<InstagramOwnershipVerified | null>(
    null,
  );
  const [challenge, setChallenge] = useState<InstagramOwnershipPending | null>(
    null,
  );
  const [hint, setHint] = useState<InstagramOwnershipHint>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  const requestGenRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const challengeRef = useRef<InstagramOwnershipPending | null>(null);
  challengeRef.current = challenge;

  const errorMessage = useCallback(
    (err: unknown) => {
      const code =
        err instanceof InstagramOwnershipError
          ? err.code
          : typeof err === 'object' &&
              err &&
              'code' in err &&
              typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'generic';
      const key = instagramOwnershipErrorToI18nKey(code);
      return t(
        `profile.social.instagramOwnership.errors.${key}` as 'profile.social.instagramOwnership.errors.generic',
      );
    },
    [t],
  );

  const applyGetIfCurrent = useCallback(
    (
      gen: number,
      forMode: ProfileMode,
      state: InstagramOwnershipGetResponse,
    ) => {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return false;
      }
      const presented = presentInstagramGetResponse(state);
      if (presented.verified && presented.verified.mode !== forMode) {
        setVerified(null);
        setChallenge(null);
        setHint(null);
        setPhase('idle');
        return true;
      }
      setVerified(presented.verified);
      setChallenge(presented.challenge);
      setHint(presented.hint);
      setPhase(presented.phase);
      return true;
    },
    [],
  );

  const refreshForMode = useCallback(
    async (
      forMode: ProfileMode,
      options?: { alertTerminal?: boolean },
    ) => {
      if (!api) {
        setPhase('idle');
        setVerified(null);
        setChallenge(null);
        return;
      }
      const gen = requestGenRef.current;
      try {
        const state = await api.getInstagramOwnershipState(forMode);
        if (gen !== requestGenRef.current || forMode !== modeRef.current) {
          return;
        }
        const wasPending = challengeRef.current != null;
        applyGetIfCurrent(gen, forMode, state);
        const presented = presentInstagramGetResponse(state);
        if (
          options?.alertTerminal &&
          wasPending &&
          presented.alertCode &&
          presented.phase === 'idle'
        ) {
          Alert.alert(t('common.error'), errorMessage({ code: presented.alertCode }));
        }
      } catch (err) {
        if (gen !== requestGenRef.current || forMode !== modeRef.current) {
          return;
        }
        if (challengeRef.current) return;
        setVerified(null);
        setChallenge(null);
        setPhase('idle');
        Alert.alert(t('common.error'), errorMessage(err), [
          { text: t('profile.social.instagramOwnership.cancel'), style: 'cancel' },
        ]);
      }
    },
    [api, applyGetIfCurrent, errorMessage, t],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!screenFocused) {
      requestGenRef.current += 1;
      return;
    }
    requestGenRef.current += 1;
    setPhase('loading');
    setVerified(null);
    setChallenge(null);
    setHint(null);
    void refreshForMode(mode);
    return () => {
      requestGenRef.current += 1;
    };
  }, [mode, screenFocused, refreshForMode]);

  useEffect(() => {
    onConnectedChange?.(!!verified && phase !== 'loading');
  }, [verified, phase, onConnectedChange]);

  const pendingLive = shouldPollInstagramOwnership({
    screenFocused,
    appActive,
    pending: phase === 'pending' && !!challenge,
    nowMs: Date.now(),
    expiresAtMs: challenge?.expiresAt ?? null,
  });

  useEffect(() => {
    if (!api || !pendingLive || !challenge) return;
    const forMode = mode;
    const expiresAtMs = challenge.expiresAt;
    const interval = setInterval(() => {
      if (
        !shouldPollInstagramOwnership({
          screenFocused: true,
          appActive: AppState.currentState === 'active',
          pending: true,
          nowMs: Date.now(),
          expiresAtMs,
        })
      ) {
        return;
      }
      void refreshForMode(forMode, { alertTerminal: true });
    }, INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS);
    const expireDelay = Math.max(0, expiresAtMs - Date.now());
    const expireTimer = setTimeout(() => {
      void refreshForMode(forMode, { alertTerminal: true });
    }, expireDelay);
    return () => {
      clearInterval(interval);
      clearTimeout(expireTimer);
    };
  }, [api, pendingLive, challenge, mode, refreshForMode]);

  useEffect(() => {
    if (!api || !appActive || !screenFocused || phase !== 'pending') return;
    void refreshForMode(mode, { alertTerminal: true });
  }, [api, appActive, screenFocused, phase, mode, refreshForMode]);

  const blocked = instagramOwnershipActionBlocked(phase);
  const connected = !!verified && verified.mode === mode;

  const onConnect = async () => {
    if (!api || blocked) return;
    const forMode = mode;
    const gen = ++requestGenRef.current;
    setPhase('connecting');
    setHint(null);
    try {
      const pending = await api.startInstagramOwnership(forMode);
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      if (pending.mode !== forMode) {
        setPhase('idle');
        await refreshForMode(forMode);
        return;
      }
      setVerified(null);
      setChallenge(pending);
      setHint(null);
      setPhase('pending');
    } catch (err) {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      setPhase('idle');
      const mapped =
        err instanceof InstagramOwnershipError
          ? err
          : new InstagramOwnershipError('generic', 'Instagram start failed.');
      const isRateLimited = mapped.code === 'instagram-rate-limited';
      Alert.alert(t('common.error'), errorMessage(mapped), [
        { text: t('profile.social.instagramOwnership.cancel'), style: 'cancel' },
      ]);
      if (!isRateLimited) {
        await refreshForMode(forMode);
      }
    }
  };

  const onDisconnect = () => {
    if (!api || blocked) return;
    Alert.alert(
      t('profile.social.instagramOwnership.disconnectConfirmTitle'),
      t('profile.social.instagramOwnership.disconnectConfirmBody'),
      [
        {
          text: t('profile.social.instagramOwnership.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.social.instagramOwnership.disconnectConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!api || blocked) return;
              const forMode = mode;
              const gen = ++requestGenRef.current;
              setPhase('disconnecting');
              try {
                const unlinked = await api.unlinkInstagramOwnership(forMode);
                if (
                  gen !== requestGenRef.current ||
                  forMode !== modeRef.current
                ) {
                  return;
                }
                if (unlinked.mode !== forMode) {
                  setPhase('idle');
                  await refreshForMode(forMode);
                  return;
                }
                setVerified(null);
                setChallenge(null);
                setHint(null);
                setPhase('idle');
              } catch (err) {
                if (
                  gen !== requestGenRef.current ||
                  forMode !== modeRef.current
                ) {
                  return;
                }
                setPhase('idle');
                Alert.alert(t('common.error'), errorMessage(err), [
                  {
                    text: t('profile.social.instagramOwnership.cancel'),
                    style: 'cancel',
                  },
                ]);
                await refreshForMode(forMode);
              }
            })();
          },
        },
      ],
    );
  };

  const onShareCode = () => {
    const code = challenge?.code?.trim();
    if (!code) return;
    void Share.share({ message: code }).catch(() => {
      Alert.alert(
        t('common.error'),
        t('profile.social.instagramOwnership.errors.generic'),
      );
    });
  };

  const onOpenInbox = () => {
    const url = challenge?.inboxProfileUrl?.trim();
    if (!url || !url.startsWith('https://')) return;
    void Linking.openURL(url).catch(() => {
      Alert.alert(
        t('common.error'),
        t('profile.social.instagramOwnership.errors.generic'),
      );
    });
  };

  const view = buildInstagramOwnershipModeView({
    mode,
    connected,
    handleLabel: verified ? instagramOwnershipHandleLabel(verified) : null,
    phase,
  });
  const hasLegacy = !!(legacyUrl && legacyUrl.trim()) && !view.connected;
  const pending = phase === 'pending' && !!challenge;

  const statusText =
    phase === 'loading'
      ? t('profile.social.loading')
      : phase === 'connecting'
        ? t('profile.social.instagramOwnership.connecting')
        : phase === 'disconnecting'
          ? t('profile.social.instagramOwnership.disconnecting')
          : pending
            ? t('profile.social.instagramOwnership.waiting')
            : view.connected
              ? t('profile.social.instagramOwnership.connected')
              : t('profile.social.notConnected');

  const primaryLabel =
    phase === 'connecting'
      ? t('profile.social.instagramOwnership.connecting')
      : phase === 'disconnecting'
        ? t('profile.social.instagramOwnership.disconnecting')
        : view.connected || pending
          ? t('profile.social.instagramOwnership.disconnect')
          : t('profile.social.instagramOwnership.connect');

  const expiresLabel = challenge
    ? t('profile.social.instagramOwnership.expiresAt', {
        time: new Date(challenge.expiresAt).toLocaleTimeString(),
      })
    : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.panel,
          borderColor: view.connected ? palette.primary : palette.border,
          borderWidth: view.connected ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        {glyph}
        <View style={styles.cardTextCol}>
          <Text style={[styles.platformName, { color: palette.textPrimary }]}>
            {label}
          </Text>
          {view.connected ? (
            <View style={styles.connectedRow}>
              <View
                style={[
                  styles.connectedDot,
                  { backgroundColor: palette.success },
                ]}
              />
              <Text style={[styles.connectedLabel, { color: palette.success }]}>
                {statusText}
              </Text>
            </View>
          ) : (
            <Text style={[styles.notConnected, { color: palette.textMuted }]}>
              {statusText}
            </Text>
          )}
        </View>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ disabled: blocked || !api, busy: blocked }}
            disabled={blocked || !api}
            onPress={onDisconnect}
            style={({ pressed }) => [
              styles.toggleBtn,
              {
                backgroundColor: 'transparent',
                borderColor: palette.danger,
              },
              blocked && styles.disabled,
              pressed && !blocked && styles.pressed,
            ]}
          >
            {blocked ? (
              <ActivityIndicator color={palette.danger} />
            ) : (
              <Text style={[styles.toggleText, { color: palette.danger }]}>
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ disabled: blocked || !api, busy: blocked }}
            disabled={blocked || !api}
            onPress={() =>
              view.connected ? onDisconnect() : void onConnect()
            }
            style={({ pressed }) => [
              styles.toggleBtn,
              view.connected
                ? {
                    backgroundColor: 'transparent',
                    borderColor: palette.danger,
                  }
                : {
                    backgroundColor: palette.primary,
                    borderColor: palette.primary,
                  },
              blocked && styles.disabled,
              pressed && !blocked && styles.pressed,
            ]}
          >
            {blocked && phase !== 'loading' ? (
              <ActivityIndicator
                color={view.connected ? palette.danger : palette.surface}
              />
            ) : (
              <Text
                style={[
                  styles.toggleText,
                  {
                    color: view.connected ? palette.danger : palette.surface,
                  },
                ]}
              >
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        )}
      </View>

      {view.connected && view.handleLabel ? (
        <Text
          style={[styles.channelUrl, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {view.handleLabel}
        </Text>
      ) : null}

      {pending && challenge ? (
        <View style={styles.pendingBox}>
          <Text style={[styles.pendingTitle, { color: palette.textPrimary }]}>
            {t('profile.social.instagramOwnership.pendingTitle')}
          </Text>
          <Text
            selectable
            style={[
              styles.code,
              {
                color: palette.textPrimary,
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            {challenge.code}
          </Text>
          <Text style={[styles.pendingBody, { color: palette.textSecondary }]}>
            {t('profile.social.instagramOwnership.pendingBody', {
              inbox: challenge.inboxUsername,
            })}
          </Text>
          {expiresLabel ? (
            <Text style={[styles.pendingBody, { color: palette.textMuted }]}>
              {expiresLabel}
            </Text>
          ) : null}
          <View style={styles.pendingActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'profile.social.instagramOwnership.shareCodeA11y',
              )}
              onPress={onShareCode}
              style={({ pressed }) => [
                styles.toggleBtn,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.toggleText, { color: palette.textPrimary }]}>
                {t('profile.social.instagramOwnership.shareCode')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'profile.social.instagramOwnership.openInboxA11y',
              )}
              onPress={onOpenInbox}
              style={({ pressed }) => [
                styles.toggleBtn,
                {
                  backgroundColor: palette.primary,
                  borderColor: palette.primary,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.toggleText, { color: palette.surface }]}>
                {t('profile.social.instagramOwnership.openInbox')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!view.connected && !pending && hint === 'expired' ? (
        <Text style={[styles.legacyHint, { color: palette.textMuted }]}>
          {t('profile.social.instagramOwnership.errors.txExpired')}
        </Text>
      ) : null}

      {!view.connected && !pending && hint === 'conflict' ? (
        <Text style={[styles.legacyHint, { color: palette.textMuted }]}>
          {t('profile.social.instagramOwnership.errors.accountClaimed')}
        </Text>
      ) : null}

      {hasLegacy && !pending ? (
        <Text style={[styles.legacyHint, { color: palette.textMuted }]}>
          {t('profile.social.instagramOwnership.legacyPrivateHint')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTextCol: { flex: 1, gap: 2 },
  platformName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectedLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  notConnected: {
    fontSize: fontSize.sm,
  },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 112,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  channelUrl: { fontSize: fontSize.sm },
  legacyHint: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  pendingBox: { gap: spacing.sm, marginTop: spacing.xs },
  pendingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  pendingBody: { fontSize: fontSize.sm },
  code: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: 2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    textAlign: 'center',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
