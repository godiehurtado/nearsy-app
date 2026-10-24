/**
 * NEARSY-209 Android — YouTube ownership card scoped to the Own Profile mode
 * being edited (Personal XOR Professional). Connect/unlink only that mode.
 * No dual publish toggles.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  YoutubeOwnershipChannelCandidate,
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipUnlinkResponse,
  YoutubeOwnershipVerified,
} from '../../social/youtubeOwnership/youtubeOwnershipContract.ts';
import {
  YoutubeOwnershipError,
  youtubeOwnershipErrorToI18nKey,
} from '../../social/youtubeOwnership/youtubeOwnershipCore.ts';
import { shouldReportOwnershipConnectedChange } from '../../social/postCrjSocialEditor.ts';
import {
  SOCIAL_ACTION_HIT_SLOP,
  socialActionButtonStyles,
} from './socialActionButtonStyles.ts';
import {
  buildYoutubeOwnershipModeView,
  youtubeOwnershipActionBlocked,
  youtubeOwnershipChannelLabel,
  type YoutubeOwnershipUiPhase,
} from '../../social/youtubeOwnership/youtubeOwnershipPresentation.ts';

type YoutubeConnectOutcome =
  import('../../social/youtubeOwnership/youtubeOwnershipCore.ts').YoutubeConnectOutcome;

type YoutubeApi = {
  connectYoutubeOwnership: (
    mode: ProfileMode,
  ) => Promise<YoutubeConnectOutcome>;
  selectYoutubeOwnershipChannel: (
    transactionId: string,
    channelId: string,
    expectedMode: ProfileMode,
  ) => Promise<YoutubeConnectOutcome>;
  getYoutubeOwnershipState: (
    mode: ProfileMode,
  ) => Promise<YoutubeOwnershipGetResponse>;
  unlinkYoutubeOwnership: (
    mode: ProfileMode,
  ) => Promise<YoutubeOwnershipUnlinkResponse>;
  resumeYoutubeOwnershipReturn: (
    mode: ProfileMode,
  ) => Promise<YoutubeConnectOutcome | { status: 'ignored' }>;
  watchYoutubeOwnershipReturns: (
    mode: ProfileMode,
    onOutcome: (outcome: YoutubeConnectOutcome) => void,
  ) => { remove: () => void };
};

function loadYoutubeApi(): YoutubeApi | null {
  if (Platform.OS !== 'android') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../social/youtubeOwnership/youtubeOwnership') as YoutubeApi;
}

type Props = {
  mode: ProfileMode;
  legacyUrl?: string;
  glyph: React.ReactNode;
  label: string;
  onConnectedChange?: (connected: boolean) => void;
};

type ConnectedSnapshot = {
  channelLabel: string | null;
};

export function YoutubeOwnershipCard({
  mode,
  legacyUrl,
  glyph,
  label,
  onConnectedChange,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const api = useMemo(() => loadYoutubeApi(), []);

  const [phase, setPhase] = useState<YoutubeOwnershipUiPhase>('loading');
  const [connected, setConnected] = useState<ConnectedSnapshot | null>(null);
  const [channelPicker, setChannelPicker] = useState<{
    transactionId: string;
    channels: YoutubeOwnershipChannelCandidate[];
  } | null>(null);

  /** Bumps on mode change / new request — discard late responses from prior mode. */
  const requestGenRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const errorMessage = useCallback(
    (err: unknown) => {
      const code =
        err instanceof YoutubeOwnershipError
          ? err.code
          : typeof err === 'object' &&
              err &&
              'code' in err &&
              typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'generic';
      const key = youtubeOwnershipErrorToI18nKey(code);
      return t(
        `profile.social.youtubeOwnership.errors.${key}` as 'profile.social.youtubeOwnership.errors.generic',
      );
    },
    [t],
  );

  const applyVerifiedIfCurrent = useCallback(
    (
      gen: number,
      forMode: ProfileMode,
      verified: YoutubeOwnershipVerified,
    ) => {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return false;
      }
      setConnected({
        channelLabel: youtubeOwnershipChannelLabel(verified),
      });
      setPhase('idle');
      return true;
    },
    [],
  );

  const applyDisconnectedIfCurrent = useCallback(
    (gen: number, forMode: ProfileMode) => {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return false;
      }
      setConnected(null);
      setPhase('idle');
      return true;
    },
    [],
  );

  const refreshForMode = useCallback(
    async (forMode: ProfileMode) => {
      if (!api) {
        setPhase('idle');
        setConnected(null);
        return;
      }
      const gen = ++requestGenRef.current;
      setPhase('loading');
      setConnected(null);
      setChannelPicker(null);
      try {
        const state = await api.getYoutubeOwnershipState(forMode);
        if (gen !== requestGenRef.current || forMode !== modeRef.current) {
          return;
        }
        if (state.result === 'verified') {
          if (state.mode !== forMode) {
            applyDisconnectedIfCurrent(gen, forMode);
            return;
          }
          applyVerifiedIfCurrent(gen, forMode, state);
        } else {
          applyDisconnectedIfCurrent(gen, forMode);
        }
      } catch (err) {
        if (gen !== requestGenRef.current || forMode !== modeRef.current) {
          return;
        }
        setConnected(null);
        setPhase('idle');
        Alert.alert(t('common.error'), errorMessage(err), [
          {
            text: t('profile.social.retry'),
            onPress: () => {
              void refreshForMode(modeRef.current);
            },
          },
          { text: t('profile.social.youtubeOwnership.cancel'), style: 'cancel' },
        ]);
      }
    },
    [api, applyDisconnectedIfCurrent, applyVerifiedIfCurrent, errorMessage, t],
  );
  const refreshForModeRef = useRef(refreshForMode);
  refreshForModeRef.current = refreshForMode;

  useEffect(() => {
    const forMode = mode;
    let cancelled = false;
    void (async () => {
      if (api?.resumeYoutubeOwnershipReturn) {
        const resumed = await api.resumeYoutubeOwnershipReturn(forMode);
        if (cancelled || forMode !== modeRef.current) return;
        if (resumed.status === 'verified') {
          applyVerifiedIfCurrent(
            requestGenRef.current,
            forMode,
            resumed.verified,
          );
          return;
        }
        if (resumed.status === 'select_channel') {
          setChannelPicker({
            transactionId: resumed.transactionId,
            channels: resumed.channels,
          });
          setPhase('idle');
          return;
        }
      }
      await refreshForModeRef.current(forMode);
    })();
    const watch = api?.watchYoutubeOwnershipReturns?.(forMode, (outcome) => {
      if (cancelled || forMode !== modeRef.current) return;
      if (outcome.status === 'verified') {
        applyVerifiedIfCurrent(
          requestGenRef.current,
          forMode,
          outcome.verified,
        );
        return;
      }
      if (outcome.status === 'select_channel') {
        setChannelPicker({
          transactionId: outcome.transactionId,
          channels: outcome.channels,
        });
        setPhase('idle');
      }
    });
    return () => {
      cancelled = true;
      requestGenRef.current += 1;
      watch?.remove();
    };
  }, [mode, api, applyVerifiedIfCurrent]);

  useEffect(() => {
    if (!shouldReportOwnershipConnectedChange(phase)) return;
    onConnectedChange?.(!!connected);
  }, [connected, phase, onConnectedChange]);

  const blocked = youtubeOwnershipActionBlocked(phase);

  const onConnect = async () => {
    if (!api || blocked) return;
    const forMode = mode;
    const gen = ++requestGenRef.current;
    setPhase('connecting');
    try {
      const outcome = await api.connectYoutubeOwnership(forMode);
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      if (outcome.status === 'cancelled') {
        setPhase('idle');
        Alert.alert(
          t('profile.social.youtubeOwnership.connect'),
          t('profile.social.youtubeOwnership.errors.cancelled'),
        );
        return;
      }
      if (outcome.status === 'failed') {
        setPhase('idle');
        Alert.alert(t('common.error'), errorMessage(outcome.error), [
          {
            text: t('profile.social.retry'),
            onPress: () => {
              void onConnect();
            },
          },
          {
            text: t('profile.social.youtubeOwnership.cancel'),
            style: 'cancel',
          },
        ]);
        await refreshForMode(forMode);
        return;
      }
      if (outcome.status === 'select_channel') {
        if (outcome.mode !== forMode) {
          setPhase('idle');
          await refreshForMode(forMode);
          return;
        }
        setPhase('idle');
        setChannelPicker({
          transactionId: outcome.transactionId,
          channels: outcome.channels,
        });
        return;
      }
      // Only mark connected after backend verified confirmation for this mode.
      if (outcome.verified.mode !== forMode) {
        setPhase('idle');
        await refreshForMode(forMode);
        return;
      }
      applyVerifiedIfCurrent(gen, forMode, outcome.verified);
    } catch (err) {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      setPhase('idle');
      Alert.alert(t('common.error'), errorMessage(err), [
        {
          text: t('profile.social.retry'),
          onPress: () => {
            void onConnect();
          },
        },
        {
          text: t('profile.social.youtubeOwnership.cancel'),
          style: 'cancel',
        },
      ]);
      await refreshForMode(forMode);
    }
  };

  const onSelectChannel = async (channelId: string) => {
    if (!api || !channelPicker || blocked) return;
    const forMode = mode;
    const gen = ++requestGenRef.current;
    const tx = channelPicker.transactionId;
    setPhase('connecting');
    setChannelPicker(null);
    try {
      const outcome = await api.selectYoutubeOwnershipChannel(
        tx,
        channelId,
        forMode,
      );
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      if (outcome.status === 'verified') {
        if (outcome.verified.mode !== forMode) {
          setPhase('idle');
          await refreshForMode(forMode);
          return;
        }
        applyVerifiedIfCurrent(gen, forMode, outcome.verified);
        return;
      }
      setPhase('idle');
      if (outcome.status === 'failed') {
        Alert.alert(t('common.error'), errorMessage(outcome.error), [
          {
            text: t('profile.social.retry'),
            onPress: () => {
              void onConnect();
            },
          },
          {
            text: t('profile.social.youtubeOwnership.cancel'),
            style: 'cancel',
          },
        ]);
      }
      await refreshForMode(forMode);
    } catch (err) {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      setPhase('idle');
      Alert.alert(t('common.error'), errorMessage(err), [
        {
          text: t('profile.social.retry'),
          onPress: () => {
            void onConnect();
          },
        },
        {
          text: t('profile.social.youtubeOwnership.cancel'),
          style: 'cancel',
        },
      ]);
      await refreshForMode(forMode);
    }
  };

  const onDisconnect = () => {
    if (!api || blocked) return;
    Alert.alert(
      t('profile.social.youtubeOwnership.disconnectConfirmTitle'),
      t('profile.social.youtubeOwnership.disconnectConfirmBody'),
      [
        {
          text: t('profile.social.youtubeOwnership.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.social.youtubeOwnership.disconnectConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!api || blocked) return;
              const forMode = mode;
              const gen = ++requestGenRef.current;
              setPhase('disconnecting');
              try {
                const unlinked = await api.unlinkYoutubeOwnership(forMode);
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
                applyDisconnectedIfCurrent(gen, forMode);
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
                    text: t('profile.social.retry'),
                    onPress: onDisconnect,
                  },
                  {
                    text: t('profile.social.youtubeOwnership.cancel'),
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

  const view = buildYoutubeOwnershipModeView({
    mode,
    connected: !!connected,
    channelLabel: connected?.channelLabel ?? null,
    phase,
  });
  const hasLegacy = !!(legacyUrl && legacyUrl.trim()) && !view.connected;

  const statusText =
    phase === 'loading'
      ? t('profile.social.loading')
      : phase === 'connecting'
        ? t('profile.social.youtubeOwnership.connecting')
        : phase === 'disconnecting'
          ? t('profile.social.youtubeOwnership.disconnecting')
          : view.connected
            ? t('profile.social.youtubeOwnership.connected')
            : t('profile.social.notConnected');

  const primaryLabel =
    phase === 'connecting'
      ? t('profile.social.youtubeOwnership.connecting')
      : phase === 'disconnecting'
        ? t('profile.social.youtubeOwnership.disconnecting')
        : view.connected
          ? t('profile.social.youtubeOwnership.disconnect')
          : t('profile.social.youtubeOwnership.connect');

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
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
              color={view.connected ? palette.danger : palette.surface}
            />
          ) : (
            <Text
              style={[
                socialActionButtonStyles.text,
                {
                  color: view.connected ? palette.danger : palette.surface,
                },
              ]}
            >
              {primaryLabel}
            </Text>
          )}
        </Pressable>
      </View>

      {view.connected && view.channelLabel ? (
        <Text
          style={[styles.channelUrl, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {view.channelLabel}
        </Text>
      ) : null}

      {hasLegacy ? (
        <Text style={[styles.legacyHint, { color: palette.textMuted }]}>
          {t('profile.social.youtubeOwnership.legacyPrivateHint')}
        </Text>
      ) : null}

      <Modal
        visible={!!channelPicker}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!blocked) setChannelPicker(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { backgroundColor: palette.surface }]}
          >
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              {t('profile.social.youtubeOwnership.selectChannelTitle')}
            </Text>
            <Text style={[styles.modalBody, { color: palette.textSecondary }]}>
              {t('profile.social.youtubeOwnership.selectChannelBody')}
            </Text>
            <FlatList
              data={channelPicker?.channels ?? []}
              keyExtractor={(item) => item.channelId}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={blocked}
                  onPress={() => void onSelectChannel(item.channelId)}
                  style={({ pressed }) => [
                    styles.channelRow,
                    { borderColor: palette.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={{ color: palette.textPrimary }}>
                      {item.title || item.channelId}
                    </Text>
                    {item.canonicalUrl ? (
                      <Text
                        style={{
                          color: palette.textMuted,
                          fontSize: fontSize.sm,
                        }}
                        numberOfLines={1}
                      >
                        {item.canonicalUrl}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )}
            />
            <Pressable
              accessibilityRole="button"
              disabled={blocked}
              onPress={() => setChannelPicker(null)}
              style={styles.modalCancel}
            >
              <Text style={{ color: palette.primary }}>
                {t('profile.social.youtubeOwnership.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  channelUrl: { fontSize: fontSize.sm },
  legacyHint: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '70%',
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalBody: { fontSize: fontSize.sm, marginBottom: spacing.sm },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
});
