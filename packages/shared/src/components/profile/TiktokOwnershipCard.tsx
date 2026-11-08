/**
 * NEARSY-209 Android — TikTok ownership card scoped to the Own Profile mode
 * being edited (Personal XOR Professional). Connect/unlink only that mode.
 * No channel picker. No dual publish toggles.
 */
import {
  noteSocialOwnership,
  noteSocialOwnershipFailed,
  noteSocialVerificationPending,
  trackSocialLinked,
} from '../../analytics/analytics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import type {
  TiktokOwnershipGetResponse,
  TiktokOwnershipUnlinkResponse,
  TiktokOwnershipVerified,
} from '../../social/tiktokOwnership/tiktokOwnershipContract.ts';
import {
  TiktokOwnershipError,
  tiktokOwnershipErrorToI18nKey,
} from '../../social/tiktokOwnership/tiktokOwnershipCore.ts';
import { shouldReportOwnershipConnectedChange } from '../../social/postCrjSocialEditor.ts';
import {
  SOCIAL_ACTION_HIT_SLOP,
  socialActionButtonStyles,
} from './socialActionButtonStyles.ts';
import { OwnershipExplainModal } from './OwnershipExplainModal.tsx';
import {
  buildTiktokOwnershipModeView,
  tiktokOwnershipActionBlocked,
  tiktokOwnershipHandleLabel,
  type TiktokOwnershipUiPhase,
} from '../../social/tiktokOwnership/tiktokOwnershipPresentation.ts';

type TiktokConnectOutcome =
  import('../../social/tiktokOwnership/tiktokOwnershipCore.ts').TiktokConnectOutcome;

type TiktokApi = {
  connectTiktokOwnership: (
    mode: ProfileMode,
  ) => Promise<TiktokConnectOutcome>;
  getTiktokOwnershipState: (
    mode: ProfileMode,
  ) => Promise<TiktokOwnershipGetResponse>;
  unlinkTiktokOwnership: (
    mode: ProfileMode,
  ) => Promise<TiktokOwnershipUnlinkResponse>;
  resumeTiktokOwnershipReturn: (
    mode: ProfileMode,
  ) => Promise<TiktokConnectOutcome | { status: 'ignored' }>;
  watchTiktokOwnershipReturns: (
    mode: ProfileMode,
    onOutcome: (outcome: TiktokConnectOutcome) => void,
  ) => { remove: () => void };
};

function loadTiktokApi(): TiktokApi | null {
  if (Platform.OS !== 'android') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../social/tiktokOwnership/tiktokOwnership') as TiktokApi;
}

type Props = {
  mode: ProfileMode;
  legacyUrl?: string;
  glyph: React.ReactNode;
  label: string;
  onConnectedChange?: (connected: boolean) => void;
};

type ConnectedSnapshot = {
  handleLabel: string | null;
};

export function TiktokOwnershipCard({
  mode,
  legacyUrl,
  glyph,
  label,
  onConnectedChange,
}: Props) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const api = useMemo(() => loadTiktokApi(), []);

  const [explainOpen, setExplainOpen] = useState(false);
  const [phase, setPhase] = useState<TiktokOwnershipUiPhase>('loading');
  const [connected, setConnected] = useState<ConnectedSnapshot | null>(null);

  /** Bumps on mode change / new request — discard late responses from prior mode. */
  const requestGenRef = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const errorMessage = useCallback(
    (err: unknown) => {
      const code =
        err instanceof TiktokOwnershipError
          ? err.code
          : typeof err === 'object' &&
              err &&
              'code' in err &&
              typeof (err as { code?: unknown }).code === 'string'
            ? (err as { code: string }).code
            : 'generic';
      const key = tiktokOwnershipErrorToI18nKey(code);
      return t(
        `profile.social.tiktokOwnership.errors.${key}` as 'profile.social.tiktokOwnership.errors.generic',
      );
    },
    [t],
  );

  const applyVerifiedIfCurrent = useCallback(
    (
      gen: number,
      forMode: ProfileMode,
      verified: TiktokOwnershipVerified,
    ) => {
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return false;
      }
      setConnected({
        handleLabel: tiktokOwnershipHandleLabel(verified),
      });
      noteSocialOwnership(forMode, 'tiktok', true);
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
      noteSocialOwnership(forMode, 'tiktok', false);
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
      try {
        const state = await api.getTiktokOwnershipState(forMode);
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
        // Unknown, not disconnected: it must not hide the other networks.
        noteSocialOwnershipFailed(forMode, 'tiktok');
        setConnected(null);
        setPhase('idle');
        Alert.alert(t('common.error'), errorMessage(err), [
          {
            text: t('profile.social.retry'),
            onPress: () => {
              void refreshForMode(modeRef.current);
            },
          },
          { text: t('profile.social.tiktokOwnership.cancel'), style: 'cancel' },
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
      if (api?.resumeTiktokOwnershipReturn) {
        const resumed = await api.resumeTiktokOwnershipReturn(forMode);
        if (cancelled || forMode !== modeRef.current) return;
        if (resumed.status === 'verified') {
          trackSocialLinked('tiktok', 'verified', forMode);
          applyVerifiedIfCurrent(
            requestGenRef.current,
            forMode,
            resumed.verified,
          );
          return;
        }
      }
      await refreshForModeRef.current(forMode);
    })();
    const watch = api?.watchTiktokOwnershipReturns?.(forMode, (outcome) => {
      if (cancelled || forMode !== modeRef.current) return;
      if (outcome.status === 'verified') {
        trackSocialLinked('tiktok', 'verified', forMode);
        applyVerifiedIfCurrent(
          requestGenRef.current,
          forMode,
          outcome.verified,
        );
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

  const blocked = tiktokOwnershipActionBlocked(phase);

  const onConnect = async () => {
    if (!api || blocked) return;
    const forMode = mode;
    const gen = ++requestGenRef.current;
    setPhase('connecting');
    // Open until a read settles it: a failed finalizer whose connection the
    // reconciliation confirms still counts once.
    noteSocialVerificationPending(forMode, 'tiktok');
    try {
      const outcome = await api.connectTiktokOwnership(forMode);
      if (gen !== requestGenRef.current || forMode !== modeRef.current) {
        return;
      }
      if (outcome.status === 'cancelled') {
        setPhase('idle');
        Alert.alert(
          t('profile.social.tiktokOwnership.connect'),
          t('profile.social.tiktokOwnership.errors.cancelled'),
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
            text: t('profile.social.tiktokOwnership.cancel'),
            style: 'cancel',
          },
        ]);
        await refreshForMode(forMode);
        return;
      }
      if (outcome.verified.mode !== forMode) {
        setPhase('idle');
        await refreshForMode(forMode);
        return;
      }
      trackSocialLinked('tiktok', 'verified', forMode);
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
          text: t('profile.social.tiktokOwnership.cancel'),
          style: 'cancel',
        },
      ]);
      await refreshForMode(forMode);
    }
  };

  const onDisconnect = () => {
    if (!api || blocked) return;
    Alert.alert(
      t('profile.social.tiktokOwnership.disconnectConfirmTitle'),
      t('profile.social.tiktokOwnership.disconnectConfirmBody'),
      [
        {
          text: t('profile.social.tiktokOwnership.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.social.tiktokOwnership.disconnectConfirmAction'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!api || blocked) return;
              const forMode = mode;
              const gen = ++requestGenRef.current;
              setPhase('disconnecting');
              try {
                const unlinked = await api.unlinkTiktokOwnership(forMode);
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
                    text: t('profile.social.tiktokOwnership.cancel'),
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

  const view = buildTiktokOwnershipModeView({
    mode,
    connected: !!connected,
    channelLabel: connected?.handleLabel ?? null,
    phase,
  });
  const hasLegacy = !!(legacyUrl && legacyUrl.trim()) && !view.connected;

  const statusText =
    phase === 'loading'
      ? t('profile.social.loading')
      : phase === 'connecting'
        ? t('profile.social.tiktokOwnership.connecting')
        : phase === 'disconnecting'
          ? t('profile.social.tiktokOwnership.disconnecting')
          : view.connected
            ? t('profile.social.tiktokOwnership.connected')
            : t('profile.social.notConnected');

  const primaryLabel =
    phase === 'connecting'
      ? t('profile.social.tiktokOwnership.connecting')
      : phase === 'disconnecting'
        ? t('profile.social.tiktokOwnership.disconnecting')
        : view.connected
          ? t('profile.social.disconnect')
          : t('profile.social.connect');
  // The button text is generic; assistive tech still hears which network it is.
  const primaryA11yLabel =
    primaryLabel === t('profile.social.connect')
      ? t('profile.social.connectA11y', { platform: label })
      : primaryLabel === t('profile.social.disconnect')
        ? t('profile.social.disconnectA11y', { platform: label })
        : `${label}: ${primaryLabel}`;

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
          accessibilityLabel={primaryA11yLabel}
          accessibilityState={{ disabled: blocked || !api, busy: blocked }}
          disabled={blocked || !api}
          hitSlop={SOCIAL_ACTION_HIT_SLOP}
          onPress={() =>
            view.connected ? onDisconnect() : setExplainOpen(true)
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
          {t('profile.social.tiktokOwnership.legacyPrivateHint')}
        </Text>
      ) : null}
      <OwnershipExplainModal
        visible={explainOpen}
        title={t('profile.social.ownershipExplain.tiktokTitle')}
        body={t('profile.social.ownershipExplain.tiktokBody')}
        confirmLabel={t('profile.social.ownershipExplain.continue')}
        onCancel={() => setExplainOpen(false)}
        onConfirm={() => {
          setExplainOpen(false);
          void onConnect();
        }}
      />
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
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.55 },
});
