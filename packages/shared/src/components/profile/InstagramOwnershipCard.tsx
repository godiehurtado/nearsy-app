/**
 * NEARSY-209 Android — Instagram reverse-DM ownership card scoped to the
 * Own Profile mode being edited. Start / Get / Unlink only. No inbox admin.
 */
import { withOwnExternalFlow } from '../../analytics/ownExternalFlow.ts';
import { noteSocialOwnership, trackSocialLinked } from '../../analytics/analytics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  AppState,
  Linking,
  Modal,
  AccessibilityInfo,
  ScrollView,
  KeyboardAvoidingView,
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
import { shouldReportOwnershipConnectedChange } from '../../social/postCrjSocialEditor.ts';
import {
  SOCIAL_ACTION_HIT_SLOP,
  socialActionButtonStyles,
} from './socialActionButtonStyles.ts';
import {
  copyTextToClipboard,
  shareTextViaSystemShare,
} from '../../social/copyTextToClipboard.ts';
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
  const api = useMemo(() => loadInstagramApi(), []);
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
  const [pendingModalOpen, setPendingModalOpen] = useState(false);

  const requestGenRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const challengeRef = useRef<InstagramOwnershipPending | null>(null);
  challengeRef.current = challenge;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

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
      noteSocialOwnership(forMode, 'instagram', !!presented.verified);
      setChallenge(presented.challenge);
      setHint(presented.hint);
      setPhase(presented.phase);
      if (
        presented.phase === 'pending' &&
        presented.challenge &&
        !challengeRef.current
      ) {
        setPendingModalOpen(true);
      }
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
        // Verification ends here, by polling: pending is not a connection.
        if (wasPending && presented.verified?.mode === forMode) {
          trackSocialLinked('instagram', 'verified', forMode);
        }
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
  const refreshForModeRef = useRef(refreshForMode);
  refreshForModeRef.current = refreshForMode;

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
    if (phaseRef.current === 'pending' && challengeRef.current) {
      void refreshForModeRef.current(mode);
      return;
    }
    requestGenRef.current += 1;
    setPhase('loading');
    setVerified(null);
    setChallenge(null);
    setHint(null);
    void refreshForModeRef.current(mode);
    return () => {
      requestGenRef.current += 1;
    };
  }, [mode, screenFocused]);

  useEffect(() => {
    if (!shouldReportOwnershipConnectedChange(phase)) return;
    onConnectedChange?.(!!verified);
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
      void refreshForModeRef.current(forMode, { alertTerminal: true });
    }, INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS);
    const expireDelay = Math.max(0, expiresAtMs - Date.now());
    const expireTimer = setTimeout(() => {
      void refreshForModeRef.current(forMode, { alertTerminal: true });
    }, expireDelay);
    return () => {
      clearInterval(interval);
      clearTimeout(expireTimer);
    };
  }, [api, pendingLive, challenge?.challengeId, challenge?.expiresAt, mode]);

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
      setPendingModalOpen(true);
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

  const onShareCode = (code: string) => {
    void shareTextViaSystemShare(code).then((result) => {
      if (result === 'failed') {
        Alert.alert(
          t('common.error'),
          t('profile.social.instagramOwnership.errors.generic'),
        );
      }
    });
  };

  const onCopyCode = () => {
    const code = challenge?.code?.trim();
    if (!code) return;
    void copyTextToClipboard(code, { sensitive: true }).then((result) => {
      if (result === 'copied') {
        AccessibilityInfo.announceForAccessibility(
          t('profile.social.instagramOwnership.copied'),
        );
        return;
      }
      if (result === 'unavailable') {
        // Explicit Share alternative for legacy binaries without expo-clipboard.
        Alert.alert(
          t('common.error'),
          t('profile.social.instagramOwnership.clipboardUnavailable'),
          [
            {
              text: t('profile.social.instagramOwnership.shareCode'),
              onPress: () => onShareCode(code),
            },
            {
              text: t('profile.social.instagramOwnership.cancel'),
              style: 'cancel',
            },
          ],
        );
        return;
      }
      Alert.alert(
        t('common.error'),
        t('profile.social.instagramOwnership.errors.generic'),
      );
    });
  };

  const onOpenInbox = () => {
    const url = challenge?.inboxProfileUrl?.trim();
    if (!url || !url.startsWith('https://')) return;
    void withOwnExternalFlow(() => Linking.openURL(url)).catch(() => {
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
          ? t('profile.social.disconnect')
          : t('profile.social.connect');
  // The button text is generic; assistive tech still hears which network it is.
  const primaryA11yLabel =
    primaryLabel === t('profile.social.connect')
      ? t('profile.social.connectA11y', { platform: label })
      : primaryLabel === t('profile.social.disconnect')
        ? t('profile.social.disconnectA11y', { platform: label })
        : `${label}: ${primaryLabel}`;

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
            <Text
              style={[styles.notConnected, { color: palette.textMuted }]}
              onPress={
                pending ? () => setPendingModalOpen(true) : undefined
              }
              accessibilityRole={pending ? 'button' : undefined}
            >
              {statusText}
            </Text>
          )}
        </View>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryA11yLabel}
            accessibilityState={{ disabled: blocked || !api, busy: blocked }}
            disabled={blocked || !api}
            hitSlop={SOCIAL_ACTION_HIT_SLOP}
            onPress={onDisconnect}
            style={({ pressed }) => [
              socialActionButtonStyles.button,
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
              <Text style={[socialActionButtonStyles.text, { color: palette.danger }]}>
                {primaryLabel}
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primaryA11yLabel}
            accessibilityState={{ disabled: blocked || !api, busy: blocked }}
            disabled={blocked || !api}
            hitSlop={SOCIAL_ACTION_HIT_SLOP}
            onPress={() =>
              view.connected ? onDisconnect() : void onConnect()
            }
            style={({ pressed }) => [
              socialActionButtonStyles.button,
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
                color={view.connected ? palette.danger : '#FFFFFF'}
              />
            ) : (
              <Text
                style={[
                  socialActionButtonStyles.text,
                  {
                    color: view.connected ? palette.danger : '#FFFFFF',
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

      <Modal
        visible={pending && !!challenge && pendingModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingModalOpen(false)}
      >
        {pending && challenge ? (
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              accessibilityRole="button"
              accessibilityLabel={t('profile.social.instagramOwnership.cancel')}
              onPress={() => setPendingModalOpen(false)}
            />
            <View
              style={[
                styles.pendingBox,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                contentContainerStyle={styles.pendingScroll}
              >
                <View style={styles.pendingHeader}>
                  {glyph}
                  <Text
                    style={[styles.pendingTitle, { color: palette.textPrimary }]}
                    maxFontSizeMultiplier={1.5}
                  >
                    {t('profile.social.instagramOwnership.pendingTitle')}
                  </Text>
                </View>
                <Text
                  style={[styles.pendingBody, { color: palette.textSecondary }]}
                  maxFontSizeMultiplier={1.5}
                >
                  {t('profile.social.instagramOwnership.pendingBody', {
                    inbox: challenge.inboxUsername,
                  })}
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
                {t('profile.social.instagramOwnership.pendingSteps', {
                  inbox: challenge.inboxUsername,
                })
                  .split('\n')
                  .filter((line) => line.trim().length > 0)
                  .map((line) => (
                    <Text
                      key={line}
                      style={[
                        styles.pendingStep,
                        { color: palette.textPrimary },
                      ]}
                      maxFontSizeMultiplier={1.5}
                    >
                      {line}
                    </Text>
                  ))}
                {expiresLabel ? (
                  <Text
                    style={[styles.pendingBody, { color: palette.textMuted }]}
                  >
                    {expiresLabel}
                  </Text>
                ) : null}
                <View style={styles.pendingActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagramOwnership.copyCodeA11y',
                    )}
                    hitSlop={SOCIAL_ACTION_HIT_SLOP}
                    onPress={onCopyCode}
                    style={({ pressed }) => [
                      socialActionButtonStyles.button,
                      styles.pendingActionBtn,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        socialActionButtonStyles.text,
                        { color: palette.textPrimary },
                      ]}
                    >
                      {t('profile.social.instagramOwnership.copyCode')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagramOwnership.openInboxA11y',
                    )}
                    hitSlop={SOCIAL_ACTION_HIT_SLOP}
                    onPress={onOpenInbox}
                    style={({ pressed }) => [
                      socialActionButtonStyles.button,
                      styles.pendingActionBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        socialActionButtonStyles.text,
                        { color: palette.surface },
                      ]}
                    >
                      {t('profile.social.instagramOwnership.openInbox')}
                    </Text>
                  </Pressable>
                </View>
                <Text
                  style={[styles.pendingBody, { color: palette.textMuted }]}
                >
                  {t('profile.social.instagramOwnership.waiting')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'profile.social.instagramOwnership.cancel',
                  )}
                  onPress={() => setPendingModalOpen(false)}
                  style={styles.waitingHint}
                >
                  <Text
                    style={[
                      styles.pendingBody,
                      { color: palette.textSecondary, fontWeight: fontWeight.semibold },
                    ]}
                  >
                    {t('profile.social.instagramOwnership.cancel')}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>

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
  cardTextCol: { flex: 1, minWidth: 0 },
  platformName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connectedLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  notConnected: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  channelUrl: { fontSize: fontSize.sm },
  legacyHint: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pendingBox: {
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  pendingScroll: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  waitingHint: { minHeight: 44, justifyContent: 'center' },
  pendingTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  pendingBody: { fontSize: fontSize.md, lineHeight: 22 },
  pendingStep: {
    fontSize: fontSize.md,
    lineHeight: 22,
    fontWeight: fontWeight.medium,
  },
  code: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    letterSpacing: 2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
    textAlign: 'center',
  },
  pendingActions: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  pendingActionBtn: {
    alignSelf: 'stretch',
    minHeight: 48,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
