/**
 * CRJ + reusable ownership cards: Connect / Get / Unlink for YouTube, TikTok,
 * Instagram, and X. Uses the same clients/controllers as SocialMediaScreen.
 * Does not include Instagram inbox admin authorize.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  AppState,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useTranslation } from '../../i18n';
import type { ProfileMode } from '../../profile/profileModeFields';
import { getUserProfile } from '../../services/firestoreService';
import { getCrjSocialPlatform } from '../../social/onboardingSocialCatalog';
import { readExistingSocialLinks } from '../../social/onboardingSocialPersistence';
import {
  getYoutubeOwnershipClient,
  getYoutubeOwnershipController,
  isYoutubeActionLocked,
  isYoutubeChannelPickLocked,
  logYoutubeOwnershipDev,
  mapYoutubeOwnershipThrowable,
  youtubeConnectedForMode,
  youtubeOwnershipErrorMessageKey,
  YoutubeOwnershipClientError,
  type YoutubeOwnershipBusyPhase,
  type YoutubeOwnershipChannelCandidate,
  type YoutubeOwnershipVerified,
} from '../../social/youtubeOwnership';
import {
  getTiktokOwnershipClient,
  getTiktokOwnershipController,
  isTiktokActionLocked,
  logTiktokOwnershipDev,
  mapTiktokOwnershipThrowable,
  tiktokConnectedForMode,
  tiktokOwnershipErrorMessageKey,
  TiktokOwnershipClientError,
  type TiktokOwnershipBusyPhase,
  type TiktokOwnershipVerified,
} from '../../social/tiktokOwnership';
import {
  getInstagramOwnershipClient,
  instagramConnectedForMode,
  instagramOwnershipErrorMessageKey,
  isInstagramActionLocked,
  logInstagramOwnershipDev,
  mapInstagramOwnershipThrowable,
  presentInstagramGetResponse,
  resolveInstagramOwnershipClientPlatform,
  shareInstagramChallengeCode,
  shouldPollInstagramOwnership,
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
  InstagramOwnershipClientError,
  type InstagramGetHint,
  type InstagramOwnershipBusyPhase,
  type InstagramOwnershipPending,
  type InstagramOwnershipVerified,
} from '../../social/instagramOwnership';
import {
  getXOwnershipClient,
  getXOwnershipController,
  isXActionLocked,
  logXOwnershipDev,
  mapXOwnershipThrowable,
  xConnectedForMode,
  xOwnershipErrorMessageKey,
  XOwnershipClientError,
  type XOwnershipBusyPhase,
  type XOwnershipVerified,
} from '../../social/xOwnership';

type Props = {
  uid: string;
  mode: ProfileMode;
  onOwnedCountChange?: (count: number) => void;
};

function PlatformGlyph({
  id,
}: {
  id: 'youtube' | 'tiktok' | 'instagram' | 'x';
}) {
  const platform = getCrjSocialPlatform(id);
  return (
    <View
      style={[
        styles.glyph,
        {
          backgroundColor: platform.color,
          borderColor:
            id === 'x' || id === 'tiktok'
              ? 'rgba(255,255,255,0.12)'
              : 'transparent',
        },
      ]}
    >
      {platform.iconSet === 'fontawesome6' ? (
        <FontAwesome6
          name={
            platform.ionicon as React.ComponentProps<typeof FontAwesome6>['name']
          }
          size={16}
          color="#FFFFFF"
        />
      ) : (
        <Ionicons
          name={
            platform.ionicon as React.ComponentProps<typeof Ionicons>['name']
          }
          size={18}
          color="#FFFFFF"
        />
      )}
    </View>
  );
}

export function OwnedSocialConnectSection({
  uid,
  mode,
  onOwnedCountChange,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [youtubeVerified, setYoutubeVerified] =
    useState<YoutubeOwnershipVerified | null>(null);
  const [youtubeLegacyUrl, setYoutubeLegacyUrl] = useState<string | null>(null);
  const [youtubeBusyPhase, setYoutubeBusyPhase] =
    useState<YoutubeOwnershipBusyPhase>('idle');
  const [youtubeChannels, setYoutubeChannels] = useState<
    YoutubeOwnershipChannelCandidate[] | null
  >(null);
  const [youtubeNeedsRetry, setYoutubeNeedsRetry] = useState(false);
  const youtubeSelectRef = useRef<
    ((channelId: string) => Promise<YoutubeOwnershipVerified>) | null
  >(null);
  const youtubeRequestGenRef = useRef(0);
  const youtubeEditorModeRef = useRef<ProfileMode>(mode);

  const [tiktokVerified, setTiktokVerified] =
    useState<TiktokOwnershipVerified | null>(null);
  const [tiktokLegacyUrl, setTiktokLegacyUrl] = useState<string | null>(null);
  const [tiktokBusyPhase, setTiktokBusyPhase] =
    useState<TiktokOwnershipBusyPhase>('idle');
  const [tiktokNeedsRetry, setTiktokNeedsRetry] = useState(false);
  const tiktokRequestGenRef = useRef(0);
  const tiktokEditorModeRef = useRef<ProfileMode>(mode);

  const [instagramVerified, setInstagramVerified] =
    useState<InstagramOwnershipVerified | null>(null);
  const [instagramChallenge, setInstagramChallenge] =
    useState<InstagramOwnershipPending | null>(null);
  const [instagramLegacyUrl, setInstagramLegacyUrl] = useState<string | null>(
    null,
  );
  const [instagramBusyPhase, setInstagramBusyPhase] =
    useState<InstagramOwnershipBusyPhase>('idle');
  const [instagramNeedsRetry, setInstagramNeedsRetry] = useState(false);
  const [instagramHint, setInstagramHint] = useState<InstagramGetHint | null>(
    null,
  );
  const instagramRequestGenRef = useRef(0);
  const instagramEditorModeRef = useRef<ProfileMode>(mode);
  const instagramChallengeRef = useRef<InstagramOwnershipPending | null>(null);

  const [xVerified, setXVerified] = useState<XOwnershipVerified | null>(null);
  const [xLegacyUrl, setXLegacyUrl] = useState<string | null>(null);
  const [xBusyPhase, setXBusyPhase] = useState<XOwnershipBusyPhase>('idle');
  const [xNeedsRetry, setXNeedsRetry] = useState(false);
  const xRequestGenRef = useRef(0);
  const xEditorModeRef = useRef<ProfileMode>(mode);

  const youtubeActionLocked = isYoutubeActionLocked(youtubeBusyPhase);
  const youtubeChannelPickLocked = isYoutubeChannelPickLocked(youtubeBusyPhase);
  const youtubeConnected = youtubeConnectedForMode(youtubeVerified, mode);
  const tiktokActionLocked = isTiktokActionLocked(tiktokBusyPhase);
  const tiktokConnected = tiktokConnectedForMode(tiktokVerified, mode);
  const instagramActionLocked = isInstagramActionLocked(instagramBusyPhase);
  const instagramConnected = instagramConnectedForMode(
    instagramVerified,
    mode,
  );
  const xActionLocked = isXActionLocked(xBusyPhase);
  const xConnected = xConnectedForMode(xVerified, mode);

  const ownedCount =
    (youtubeConnected ? 1 : 0) +
    (tiktokConnected ? 1 : 0) +
    (instagramConnected ? 1 : 0) +
    (xConnected ? 1 : 0);

  useEffect(() => {
    onOwnedCountChange?.(ownedCount);
  }, [ownedCount, onOwnedCountChange]);

  useEffect(() => {
    youtubeEditorModeRef.current = mode;
    tiktokEditorModeRef.current = mode;
    instagramEditorModeRef.current = mode;
    xEditorModeRef.current = mode;
  }, [mode]);
  instagramChallengeRef.current = instagramChallenge;

  useEffect(() => {
    const requestGen = ++youtubeRequestGenRef.current;
    tiktokRequestGenRef.current = requestGen;
    instagramRequestGenRef.current = requestGen;
    xRequestGenRef.current = requestGen;
    const modeForRequest = mode;
    let cancelled = false;

    setYoutubeVerified(null);
    setYoutubeChannels(null);
    setYoutubeNeedsRetry(false);
    youtubeSelectRef.current = null;
    setYoutubeBusyPhase('loading');
    setTiktokVerified(null);
    setTiktokNeedsRetry(false);
    setTiktokBusyPhase('loading');
    setInstagramVerified(null);
    setInstagramChallenge(null);
    setInstagramNeedsRetry(false);
    setInstagramHint(null);
    setInstagramBusyPhase('loading');
    setXVerified(null);
    setXNeedsRetry(false);
    setXBusyPhase('loading');

    (async () => {
      try {
        const existing = await getUserProfile(uid);
        if (cancelled || requestGen !== youtubeRequestGenRef.current) return;
        const existingLinks = readExistingSocialLinks(
          (existing as Record<string, unknown>) ?? null,
          modeForRequest,
        );
        const youtubeLegacy =
          typeof existingLinks.youtube === 'string'
            ? existingLinks.youtube.trim()
            : '';
        const tiktokLegacy =
          typeof existingLinks.tiktok === 'string'
            ? existingLinks.tiktok.trim()
            : '';
        const instagramLegacy =
          typeof existingLinks.instagram === 'string'
            ? existingLinks.instagram.trim()
            : '';
        const xLegacy =
          typeof existingLinks.twitter === 'string'
            ? existingLinks.twitter.trim()
            : '';
        setYoutubeLegacyUrl(youtubeLegacy || null);
        setTiktokLegacyUrl(tiktokLegacy || null);
        setInstagramLegacyUrl(instagramLegacy || null);
        setXLegacyUrl(xLegacy || null);

        await Promise.all([
          (async () => {
            try {
              const client = await getYoutubeOwnershipClient();
              const get = await client.get(modeForRequest);
              if (cancelled || requestGen !== youtubeRequestGenRef.current) {
                return;
              }
              if (youtubeEditorModeRef.current !== modeForRequest) return;
              setYoutubeVerified(get.result === 'verified' ? get : null);
            } catch {
              if (cancelled || requestGen !== youtubeRequestGenRef.current) {
                return;
              }
              setYoutubeVerified(null);
            }
          })(),
          (async () => {
            try {
              const client = await getTiktokOwnershipClient();
              const get = await client.get(modeForRequest);
              if (cancelled || requestGen !== tiktokRequestGenRef.current) {
                return;
              }
              if (tiktokEditorModeRef.current !== modeForRequest) return;
              setTiktokVerified(get.result === 'verified' ? get : null);
            } catch {
              if (cancelled || requestGen !== tiktokRequestGenRef.current) {
                return;
              }
              setTiktokVerified(null);
            }
          })(),
          (async () => {
            try {
              const client = await getInstagramOwnershipClient();
              const get = await client.get(modeForRequest);
              if (cancelled || requestGen !== instagramRequestGenRef.current) {
                return;
              }
              if (instagramEditorModeRef.current !== modeForRequest) return;
              const presented = presentInstagramGetResponse(get);
              setInstagramVerified(presented.verified);
              setInstagramChallenge(presented.challenge);
              instagramChallengeRef.current = presented.challenge;
              setInstagramHint(presented.hint);
              setInstagramNeedsRetry(presented.needsRetry);
              setInstagramBusyPhase(presented.phase);
            } catch {
              if (cancelled || requestGen !== instagramRequestGenRef.current) {
                return;
              }
              setInstagramVerified(null);
              setInstagramChallenge(null);
            }
          })(),
          (async () => {
            try {
              const client = await getXOwnershipClient();
              const get = await client.get(modeForRequest);
              if (cancelled || requestGen !== xRequestGenRef.current) return;
              if (xEditorModeRef.current !== modeForRequest) return;
              setXVerified(get.result === 'verified' ? get : null);
            } catch {
              if (cancelled || requestGen !== xRequestGenRef.current) return;
              setXVerified(null);
            }
          })(),
        ]);
      } finally {
        if (!cancelled && requestGen === youtubeRequestGenRef.current) {
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
          setInstagramBusyPhase((phase) =>
            phase === 'pending' ? 'pending' : 'idle',
          );
          setXBusyPhase('idle');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, mode]);

  const presentYoutubeError = useCallback(
    (err: unknown, onRetry?: () => void) => {
      const mapped =
        err instanceof YoutubeOwnershipClientError
          ? err
          : mapYoutubeOwnershipThrowable(err);
      logYoutubeOwnershipDev('present_error', {
        stage: mapped.stage ?? 'unknown',
        code: mapped.code,
        wireCode: mapped.wireCode ?? '',
        retryable: mapped.retryable,
      });
      const key = youtubeOwnershipErrorMessageKey(mapped.code);
      setYoutubeNeedsRetry(true);
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }> = [{ text: t('common.cancel'), style: 'cancel' }];
      if (onRetry) {
        buttons.push({
          text: t('profile.social.youtube.retry'),
          onPress: onRetry,
        });
      }
      Alert.alert(t('common.error'), t(key as any), buttons);
    },
    [t],
  );

  const isYoutubeResultCurrent = useCallback(
    (requestGen: number, modeForRequest: ProfileMode) =>
      requestGen === youtubeRequestGenRef.current &&
      youtubeEditorModeRef.current === modeForRequest,
    [],
  );

  const handleYoutubeConnectRef = useRef<() => void>(() => {});
  const handleYoutubeConnect = useCallback(async () => {
    if (youtubeActionLocked) return;
    const requestGen = youtubeRequestGenRef.current;
    const modeForRequest = mode;
    let staySelecting = false;
    try {
      setYoutubeNeedsRetry(false);
      setYoutubeBusyPhase('connecting');
      setYoutubeChannels(null);
      youtubeSelectRef.current = null;
      const controller = await getYoutubeOwnershipController();
      const outcome = await controller.connect(modeForRequest);
      if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
      if (outcome.kind === 'cancelled') return;
      if (outcome.kind === 'error') {
        presentYoutubeError(outcome.error, () => {
          handleYoutubeConnectRef.current();
        });
        return;
      }
      if (outcome.kind === 'select_channel') {
        staySelecting = true;
        setYoutubeChannels(outcome.channels);
        youtubeSelectRef.current = outcome.select;
        setYoutubeBusyPhase('selecting');
        return;
      }
      setYoutubeVerified(outcome.verified);
      setYoutubeChannels(null);
      setYoutubeNeedsRetry(false);
    } catch (err) {
      if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
      presentYoutubeError(err, () => {
        handleYoutubeConnectRef.current();
      });
    } finally {
      if (isYoutubeResultCurrent(requestGen, modeForRequest) && !staySelecting) {
        setYoutubeBusyPhase('idle');
      }
    }
  }, [isYoutubeResultCurrent, mode, presentYoutubeError, youtubeActionLocked]);
  handleYoutubeConnectRef.current = () => {
    void handleYoutubeConnect();
  };

  const handleYoutubeSelectChannel = useCallback(
    async (channelId: string) => {
      if (youtubeChannelPickLocked || !youtubeSelectRef.current) return;
      const requestGen = youtubeRequestGenRef.current;
      const modeForRequest = mode;
      try {
        setYoutubeNeedsRetry(false);
        setYoutubeBusyPhase('connecting');
        const verified = await youtubeSelectRef.current(channelId);
        if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
        setYoutubeVerified(verified);
        setYoutubeChannels(null);
        youtubeSelectRef.current = null;
        setYoutubeNeedsRetry(false);
      } catch (err) {
        if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
        presentYoutubeError(err, () => {
          void handleYoutubeSelectChannel(channelId);
        });
        setYoutubeChannels(null);
        youtubeSelectRef.current = null;
      } finally {
        if (isYoutubeResultCurrent(requestGen, modeForRequest)) {
          setYoutubeBusyPhase('idle');
        }
      }
    },
    [
      isYoutubeResultCurrent,
      mode,
      presentYoutubeError,
      youtubeChannelPickLocked,
    ],
  );

  const handleYoutubeDisconnect = useCallback(() => {
    if (youtubeActionLocked) return;
    Alert.alert(
      t('profile.social.youtube.unlinkConfirmTitle'),
      t('profile.social.youtube.unlinkConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.social.youtube.disconnect'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const requestGen = youtubeRequestGenRef.current;
              const modeForRequest = mode;
              try {
                setYoutubeNeedsRetry(false);
                setYoutubeBusyPhase('disconnecting');
                const client = await getYoutubeOwnershipClient();
                await client.unlink(modeForRequest);
                if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
                setYoutubeVerified(null);
                setYoutubeChannels(null);
                youtubeSelectRef.current = null;
                setYoutubeNeedsRetry(false);
              } catch (err) {
                if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
                try {
                  const client = await getYoutubeOwnershipClient();
                  const get = await client.get(modeForRequest);
                  if (!isYoutubeResultCurrent(requestGen, modeForRequest)) {
                    return;
                  }
                  setYoutubeVerified(get.result === 'verified' ? get : null);
                } catch {
                  // Keep prior verified state if Get also fails.
                }
                if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
                presentYoutubeError(err, () => {
                  handleYoutubeDisconnect();
                });
              } finally {
                if (isYoutubeResultCurrent(requestGen, modeForRequest)) {
                  setYoutubeBusyPhase('idle');
                }
              }
            })();
          },
        },
      ],
    );
  }, [
    isYoutubeResultCurrent,
    mode,
    presentYoutubeError,
    t,
    youtubeActionLocked,
  ]);

  const presentTiktokError = useCallback(
    (err: unknown, onRetry?: () => void) => {
      const mapped =
        err instanceof TiktokOwnershipClientError
          ? err
          : mapTiktokOwnershipThrowable(err);
      logTiktokOwnershipDev('present_error', {
        stage: mapped.stage ?? 'unknown',
        code: mapped.code,
        wireCode: mapped.wireCode ?? '',
        retryable: mapped.retryable,
      });
      const key = tiktokOwnershipErrorMessageKey(mapped.code);
      setTiktokNeedsRetry(true);
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }> = [{ text: t('common.cancel'), style: 'cancel' }];
      if (onRetry) {
        buttons.push({
          text: t('profile.social.tiktok.retry'),
          onPress: onRetry,
        });
      }
      Alert.alert(t('common.error'), t(key as any), buttons);
    },
    [t],
  );

  const isTiktokResultCurrent = useCallback(
    (requestGen: number, modeForRequest: ProfileMode) =>
      requestGen === tiktokRequestGenRef.current &&
      tiktokEditorModeRef.current === modeForRequest,
    [],
  );

  const handleTiktokConnectRef = useRef<() => void>(() => {});
  const handleTiktokConnect = useCallback(async () => {
    if (tiktokActionLocked) return;
    const requestGen = tiktokRequestGenRef.current;
    const modeForRequest = mode;
    try {
      setTiktokNeedsRetry(false);
      setTiktokBusyPhase('connecting');
      const controller = await getTiktokOwnershipController();
      const outcome = await controller.connect(modeForRequest);
      if (!isTiktokResultCurrent(requestGen, modeForRequest)) return;
      if (outcome.kind === 'cancelled') {
        setTiktokBusyPhase('idle');
        return;
      }
      if (outcome.kind === 'error') {
        setTiktokBusyPhase('idle');
        presentTiktokError(outcome.error, () => {
          handleTiktokConnectRef.current();
        });
        return;
      }
      setTiktokVerified(outcome.verified);
      setTiktokNeedsRetry(false);
      setTiktokBusyPhase('idle');
    } catch (err) {
      if (!isTiktokResultCurrent(requestGen, modeForRequest)) return;
      setTiktokBusyPhase('idle');
      presentTiktokError(err, () => {
        handleTiktokConnectRef.current();
      });
    }
  }, [isTiktokResultCurrent, mode, presentTiktokError, tiktokActionLocked]);
  handleTiktokConnectRef.current = () => {
    void handleTiktokConnect();
  };

  const handleTiktokDisconnect = useCallback(() => {
    if (tiktokActionLocked) return;
    Alert.alert(
      t('profile.social.tiktok.unlinkConfirmTitle'),
      t('profile.social.tiktok.unlinkConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.social.tiktok.disconnect'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const requestGen = tiktokRequestGenRef.current;
              const modeForRequest = mode;
              try {
                setTiktokNeedsRetry(false);
                setTiktokBusyPhase('disconnecting');
                const client = await getTiktokOwnershipClient();
                await client.unlink(modeForRequest);
                if (!isTiktokResultCurrent(requestGen, modeForRequest)) return;
                setTiktokVerified(null);
                setTiktokNeedsRetry(false);
              } catch (err) {
                if (!isTiktokResultCurrent(requestGen, modeForRequest)) return;
                try {
                  const client = await getTiktokOwnershipClient();
                  const get = await client.get(modeForRequest);
                  if (!isTiktokResultCurrent(requestGen, modeForRequest)) {
                    return;
                  }
                  setTiktokVerified(get.result === 'verified' ? get : null);
                } catch {
                  // Keep prior verified state if Get also fails.
                }
                if (!isTiktokResultCurrent(requestGen, modeForRequest)) return;
                presentTiktokError(err, () => {
                  handleTiktokDisconnect();
                });
              } finally {
                if (isTiktokResultCurrent(requestGen, modeForRequest)) {
                  setTiktokBusyPhase('idle');
                }
              }
            })();
          },
        },
      ],
    );
  }, [isTiktokResultCurrent, mode, presentTiktokError, t, tiktokActionLocked]);

  const presentInstagramError = useCallback(
    (err: unknown, onRetry?: () => void) => {
      const mapped =
        err instanceof InstagramOwnershipClientError
          ? err
          : mapInstagramOwnershipThrowable(err);
      logInstagramOwnershipDev('present_error', {
        stage: mapped.stage ?? 'unknown',
        mappedCode: mapped.code,
        wireCode: mapped.wireCode ?? '',
        retryable: mapped.retryable,
      });
      const key = instagramOwnershipErrorMessageKey(mapped.code);
      setInstagramNeedsRetry(true);
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }> = [{ text: t('common.cancel'), style: 'cancel' }];
      if (onRetry) {
        buttons.push({
          text: t('profile.social.instagram.retry'),
          onPress: onRetry,
        });
      }
      Alert.alert(t('common.error'), t(key as any), buttons);
    },
    [t],
  );

  const isInstagramResultCurrent = useCallback(
    (requestGen: number, modeForRequest: ProfileMode) =>
      requestGen === instagramRequestGenRef.current &&
      instagramEditorModeRef.current === modeForRequest,
    [],
  );

  const handleInstagramConnectRef = useRef<() => void>(() => {});
  const handleInstagramConnect = useCallback(async () => {
    if (instagramActionLocked) return;
    const requestGen = instagramRequestGenRef.current;
    const modeForRequest = mode;
    try {
      setInstagramNeedsRetry(false);
      setInstagramHint(null);
      setInstagramBusyPhase('connecting');
      const client = await getInstagramOwnershipClient();
      const pending = await client.start({
        mode: modeForRequest,
        platform: resolveInstagramOwnershipClientPlatform(),
      });
      if (!isInstagramResultCurrent(requestGen, modeForRequest)) return;
      if (pending.mode !== modeForRequest) {
        setInstagramBusyPhase('idle');
        presentInstagramError(
          new InstagramOwnershipClientError(
            'INVALID_RESPONSE',
            'Instagram ownership Start mode mismatch.',
            { stage: 'start' },
          ),
          () => {
            handleInstagramConnectRef.current();
          },
        );
        return;
      }
      setInstagramVerified(null);
      setInstagramChallenge(pending);
      instagramChallengeRef.current = pending;
      setInstagramHint(null);
      setInstagramBusyPhase('pending');
    } catch (err) {
      if (!isInstagramResultCurrent(requestGen, modeForRequest)) return;
      setInstagramBusyPhase('idle');
      const mapped = mapInstagramOwnershipThrowable(err, 'start');
      presentInstagramError(
        mapped,
        mapped.retryable
          ? () => {
              handleInstagramConnectRef.current();
            }
          : undefined,
      );
    }
  }, [
    instagramActionLocked,
    isInstagramResultCurrent,
    mode,
    presentInstagramError,
  ]);
  handleInstagramConnectRef.current = () => {
    void handleInstagramConnect();
  };

  const applyInstagramGet = useCallback(
    async (
      requestGen: number,
      modeForRequest: ProfileMode,
      options?: { alertTerminal?: boolean },
    ) => {
      const client = await getInstagramOwnershipClient();
      const get = await client.get(modeForRequest);
      if (!isInstagramResultCurrent(requestGen, modeForRequest)) return;
      const wasPending = Boolean(instagramChallengeRef.current);
      const presented = presentInstagramGetResponse(get);
      setInstagramVerified(presented.verified);
      setInstagramChallenge(presented.challenge);
      instagramChallengeRef.current = presented.challenge;
      setInstagramHint(presented.hint);
      setInstagramNeedsRetry(presented.needsRetry);
      setInstagramBusyPhase(presented.phase);
      if (
        options?.alertTerminal &&
        wasPending &&
        presented.alertCode &&
        presented.phase === 'idle'
      ) {
        presentInstagramError(
          new InstagramOwnershipClientError(
            presented.alertCode,
            presented.alertCode,
            { stage: 'poll' },
          ),
          presented.needsRetry
            ? () => {
                handleInstagramConnectRef.current();
              }
            : undefined,
        );
      }
    },
    [isInstagramResultCurrent, presentInstagramError],
  );

  useEffect(() => {
    const pending = instagramBusyPhase === 'pending';
    const expiresAtMs = instagramChallenge?.expiresAt ?? null;
    if (!pending) return;

    const requestGen = instagramRequestGenRef.current;
    const modeForRequest = mode;
    let cancelled = false;

    const fetchGet = async () => {
      if (cancelled) return;
      try {
        await applyInstagramGet(requestGen, modeForRequest, {
          alertTerminal: true,
        });
      } catch (err) {
        if (cancelled || !isInstagramResultCurrent(requestGen, modeForRequest)) {
          return;
        }
        const mapped = mapInstagramOwnershipThrowable(err, 'poll');
        logInstagramOwnershipDev('poll_error', {
          stage: 'poll',
          mappedCode: mapped.code,
          wireCode: mapped.wireCode ?? '',
          retryable: mapped.retryable,
        });
      }
    };

    void fetchGet();

    const live = shouldPollInstagramOwnership({
      screenActive: true,
      pending: true,
      nowMs: Date.now(),
      expiresAtMs,
    });
    const interval = live
      ? setInterval(() => {
          if (
            !shouldPollInstagramOwnership({
              screenActive: true,
              pending: true,
              nowMs: Date.now(),
              expiresAtMs,
            })
          ) {
            return;
          }
          void fetchGet();
        }, INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS)
      : undefined;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void fetchGet();
    });

    const expireTimer =
      expiresAtMs != null && expiresAtMs > Date.now()
        ? setTimeout(() => {
            void fetchGet();
          }, expiresAtMs - Date.now())
        : undefined;

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      if (expireTimer) clearTimeout(expireTimer);
      sub.remove();
    };
  }, [
    applyInstagramGet,
    instagramBusyPhase,
    instagramChallenge?.expiresAt,
    isInstagramResultCurrent,
    mode,
  ]);

  const handleInstagramShare = useCallback(() => {
    const code = instagramChallenge?.code;
    if (!code) return;
    void shareInstagramChallengeCode(code).catch(() => {
      presentInstagramError(
        new InstagramOwnershipClientError(
          'UNKNOWN',
          'Could not share Instagram code.',
          { stage: 'unknown' },
        ),
      );
    });
  }, [instagramChallenge, presentInstagramError]);

  const handleInstagramOpen = useCallback(() => {
    const url = instagramChallenge?.inboxProfileUrl;
    if (!url) return;
    void Linking.openURL(url).catch(() => {
      presentInstagramError(
        new InstagramOwnershipClientError(
          'NETWORK',
          'Could not open Instagram.',
          { retryable: true, stage: 'unknown' },
        ),
      );
    });
  }, [instagramChallenge, presentInstagramError]);

  const handleInstagramDisconnect = useCallback(() => {
    if (instagramActionLocked) return;
    Alert.alert(
      t('profile.social.instagram.unlinkConfirmTitle'),
      t('profile.social.instagram.unlinkConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.social.instagram.disconnect'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const requestGen = instagramRequestGenRef.current;
              const modeForRequest = mode;
              try {
                setInstagramNeedsRetry(false);
                setInstagramBusyPhase('disconnecting');
                const client = await getInstagramOwnershipClient();
                await client.unlink(modeForRequest);
                if (!isInstagramResultCurrent(requestGen, modeForRequest)) {
                  return;
                }
                setInstagramVerified(null);
                setInstagramChallenge(null);
                instagramChallengeRef.current = null;
                setInstagramHint(null);
                setInstagramNeedsRetry(false);
              } catch (err) {
                if (!isInstagramResultCurrent(requestGen, modeForRequest)) {
                  return;
                }
                try {
                  const client = await getInstagramOwnershipClient();
                  const get = await client.get(modeForRequest);
                  if (!isInstagramResultCurrent(requestGen, modeForRequest)) {
                    return;
                  }
                  const presented = presentInstagramGetResponse(get);
                  setInstagramVerified(presented.verified);
                  setInstagramChallenge(presented.challenge);
                  instagramChallengeRef.current = presented.challenge;
                  setInstagramHint(presented.hint);
                  setInstagramNeedsRetry(presented.needsRetry);
                  if (presented.phase === 'pending') {
                    setInstagramBusyPhase('pending');
                    return;
                  }
                } catch {
                  // Keep prior verified state if Get also fails.
                }
                if (!isInstagramResultCurrent(requestGen, modeForRequest)) {
                  return;
                }
                presentInstagramError(err, () => {
                  handleInstagramDisconnect();
                });
              } finally {
                if (isInstagramResultCurrent(requestGen, modeForRequest)) {
                  setInstagramBusyPhase((phase) =>
                    phase === 'pending' ? 'pending' : 'idle',
                  );
                }
              }
            })();
          },
        },
      ],
    );
  }, [
    instagramActionLocked,
    isInstagramResultCurrent,
    mode,
    presentInstagramError,
    t,
  ]);

  const presentXError = useCallback(
    (err: unknown, onRetry?: () => void) => {
      const mapped =
        err instanceof XOwnershipClientError
          ? err
          : mapXOwnershipThrowable(err);
      logXOwnershipDev('present_error', {
        stage: mapped.stage ?? 'unknown',
        mappedCode: mapped.code,
        wireCode: mapped.wireCode ?? '',
        retryable: mapped.retryable,
      });
      const key = xOwnershipErrorMessageKey(mapped.code);
      setXNeedsRetry(true);
      const buttons: Array<{
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress?: () => void;
      }> = [{ text: t('common.cancel'), style: 'cancel' }];
      if (onRetry) {
        buttons.push({
          text: t('profile.social.x.retry'),
          onPress: onRetry,
        });
      }
      Alert.alert(t('common.error'), t(key as any), buttons);
    },
    [t],
  );

  const isXResultCurrent = useCallback(
    (requestGen: number, modeForRequest: ProfileMode) =>
      requestGen === xRequestGenRef.current &&
      xEditorModeRef.current === modeForRequest,
    [],
  );

  const handleXConnectRef = useRef<() => void>(() => {});
  const handleXConnect = useCallback(async () => {
    if (xActionLocked) return;
    const requestGen = xRequestGenRef.current;
    const modeForRequest = mode;
    try {
      setXNeedsRetry(false);
      setXBusyPhase('connecting');
      const controller = await getXOwnershipController();
      const outcome = await controller.connect(modeForRequest);
      if (!isXResultCurrent(requestGen, modeForRequest)) return;
      if (outcome.kind === 'cancelled') {
        setXBusyPhase('idle');
        return;
      }
      if (outcome.kind === 'error') {
        if (outcome.error.stage === 'exchange') {
          try {
            const client = await getXOwnershipClient();
            const get = await client.get(modeForRequest);
            if (!isXResultCurrent(requestGen, modeForRequest)) return;
            setXVerified(get.result === 'verified' ? get : null);
          } catch {
            // Keep prior verified state if Get also fails.
          }
        }
        setXBusyPhase('idle');
        presentXError(
          outcome.error,
          outcome.error.retryable
            ? () => {
                handleXConnectRef.current();
              }
            : undefined,
        );
        return;
      }
      setXVerified(outcome.verified);
      setXNeedsRetry(false);
      setXBusyPhase('idle');
    } catch (err) {
      if (!isXResultCurrent(requestGen, modeForRequest)) return;
      setXBusyPhase('idle');
      const mapped = mapXOwnershipThrowable(err, 'exchange');
      presentXError(
        mapped,
        mapped.retryable
          ? () => {
              handleXConnectRef.current();
            }
          : undefined,
      );
    }
  }, [isXResultCurrent, mode, presentXError, xActionLocked]);
  handleXConnectRef.current = () => {
    void handleXConnect();
  };

  const handleXDisconnect = useCallback(() => {
    if (xActionLocked) return;
    Alert.alert(
      t('profile.social.x.unlinkConfirmTitle'),
      t('profile.social.x.unlinkConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.social.x.disconnect'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const requestGen = xRequestGenRef.current;
              const modeForRequest = mode;
              try {
                setXNeedsRetry(false);
                setXBusyPhase('disconnecting');
                const client = await getXOwnershipClient();
                await client.unlink(modeForRequest);
                if (!isXResultCurrent(requestGen, modeForRequest)) return;
                setXVerified(null);
                setXNeedsRetry(false);
              } catch (err) {
                if (!isXResultCurrent(requestGen, modeForRequest)) return;
                try {
                  const client = await getXOwnershipClient();
                  const get = await client.get(modeForRequest);
                  if (!isXResultCurrent(requestGen, modeForRequest)) return;
                  setXVerified(get.result === 'verified' ? get : null);
                } catch {
                  // Keep prior verified state if Get also fails.
                }
                if (!isXResultCurrent(requestGen, modeForRequest)) return;
                presentXError(err, () => {
                  handleXDisconnect();
                });
              } finally {
                if (isXResultCurrent(requestGen, modeForRequest)) {
                  setXBusyPhase('idle');
                }
              }
            })();
          },
        },
      ],
    );
  }, [isXResultCurrent, mode, presentXError, t, xActionLocked]);

  const youtubeLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.youtube` as any,
  );
  const tiktokLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.tiktok` as any,
  );
  const instagramLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.instagram` as any,
  );
  const xLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.x` as any,
  );

  function renderConnectCard(args: {
    id: 'youtube' | 'tiktok' | 'instagram' | 'x';
    label: string;
    connected: boolean;
    locked: boolean;
    busy: string;
    connectingLabel: string;
    disconnectingLabel: string;
    connectedLabel: string;
    notConnectedLabel: string;
    connectLabel: string;
    retryLabel: string;
    disconnectLabel: string;
    connectA11y: string;
    disconnectA11y: string;
    onConnect: () => void;
    onDisconnect: () => void;
    hideConnect?: boolean;
    canonicalUrl?: string | null;
    legacyUrl?: string | null;
    legacyLabel?: string;
    extra?: React.ReactNode;
  }) {
    return (
      <View
        key={args.id}
        style={[
          styles.card,
          {
            backgroundColor: palette.panel,
            borderColor: args.connected ? palette.primary : palette.accentBorder,
            borderWidth: args.connected ? 1.5 : 1,
          },
        ]}
      >
        <View style={styles.cardTopRow}>
          <PlatformGlyph id={args.id} />
          <View style={styles.cardTextCol}>
            <Text style={[styles.platformName, { color: palette.textPrimary }]}>
              {args.label}
            </Text>
            {args.busy === 'connecting' || args.busy === 'disconnecting' ? (
              <Text style={[styles.notConnected, { color: palette.textMuted }]}>
                {args.busy === 'disconnecting'
                  ? args.disconnectingLabel
                  : args.connectingLabel}
              </Text>
            ) : args.busy === 'pending' ? (
              <Text style={[styles.notConnected, { color: palette.textMuted }]}>
                {t('profile.social.instagram.waiting')}
              </Text>
            ) : args.connected ? (
              <View style={styles.connectedRow}>
                <View
                  style={[
                    styles.connectedDot,
                    { backgroundColor: palette.success },
                  ]}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text
                  style={[styles.connectedLabel, { color: palette.success }]}
                >
                  {args.connectedLabel}
                </Text>
              </View>
            ) : (
              <Text style={[styles.notConnected, { color: palette.textMuted }]}>
                {args.notConnectedLabel}
              </Text>
            )}
          </View>
          {args.connected ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={args.disconnectA11y}
              disabled={args.locked}
              onPress={args.onDisconnect}
              style={({ pressed }) => [
                styles.toggleBtn,
                {
                  backgroundColor: 'transparent',
                  borderColor: palette.danger,
                  opacity: args.locked ? 0.5 : 1,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.toggleText, { color: palette.danger }]}>
                {args.busy === 'disconnecting'
                  ? args.disconnectingLabel
                  : args.disconnectLabel}
              </Text>
            </Pressable>
          ) : args.hideConnect ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={args.connectA11y}
              disabled={args.locked}
              onPress={args.onConnect}
              style={({ pressed }) => [
                styles.toggleBtn,
                {
                  backgroundColor: palette.primary,
                  borderColor: palette.primary,
                  opacity: args.locked ? 0.5 : 1,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.toggleText, { color: palette.surface }]}>
                {args.busy === 'connecting'
                  ? args.connectingLabel
                  : args.retryLabel}
              </Text>
            </Pressable>
          )}
        </View>
        {args.connected && args.canonicalUrl ? (
          <Text
            style={[styles.helperText, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {args.canonicalUrl}
          </Text>
        ) : null}
        {!args.connected && args.legacyUrl && args.legacyLabel ? (
          <Text style={[styles.helperText, { color: palette.textMuted }]}>
            {args.legacyLabel}
          </Text>
        ) : null}
        {args.extra}
      </View>
    );
  }

  return (
    <View style={styles.cards}>
      {renderConnectCard({
        id: 'youtube',
        label: youtubeLabel,
        connected: youtubeConnected,
        locked: youtubeActionLocked,
        busy: youtubeBusyPhase,
        connectingLabel: t('profile.social.youtube.connecting'),
        disconnectingLabel: t('profile.social.youtube.disconnecting'),
        connectedLabel: t('profile.social.youtube.connected'),
        notConnectedLabel: t('profile.social.youtube.notConnected'),
        connectLabel: t('profile.social.youtube.connect'),
        retryLabel: youtubeNeedsRetry
          ? t('profile.social.youtube.retry')
          : t('profile.social.youtube.connect'),
        disconnectLabel: t('profile.social.youtube.disconnect'),
        connectA11y: t('profile.social.youtube.connectA11y'),
        disconnectA11y: t('profile.social.youtube.disconnectA11y'),
        onConnect: () => {
          void handleYoutubeConnect();
        },
        onDisconnect: handleYoutubeDisconnect,
        canonicalUrl: youtubeVerified?.canonicalUrl,
        legacyUrl: youtubeLegacyUrl,
        legacyLabel: t('profile.social.youtube.legacyStored'),
        extra:
          youtubeChannels && youtubeChannels.length > 0 ? (
            <View style={styles.channelPicker}>
              <Text
                style={[styles.platformName, { color: palette.textPrimary }]}
              >
                {t('profile.social.youtube.selectChannelTitle')}
              </Text>
              <Text
                style={[styles.helperText, { color: palette.textSecondary }]}
              >
                {t('profile.social.youtube.selectChannelBody')}
              </Text>
              {youtubeChannels.map((channel) => (
                <Pressable
                  key={channel.channelId}
                  accessibilityRole="button"
                  disabled={youtubeChannelPickLocked}
                  onPress={() => {
                    void handleYoutubeSelectChannel(channel.channelId);
                  }}
                  style={({ pressed }) => [
                    styles.channelOption,
                    {
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                      opacity: youtubeChannelPickLocked ? 0.5 : 1,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.publishLabel,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {channel.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null,
      })}
      {renderConnectCard({
        id: 'tiktok',
        label: tiktokLabel,
        connected: tiktokConnected,
        locked: tiktokActionLocked,
        busy: tiktokBusyPhase,
        connectingLabel: t('profile.social.tiktok.connecting'),
        disconnectingLabel: t('profile.social.tiktok.disconnecting'),
        connectedLabel: t('profile.social.tiktok.connected'),
        notConnectedLabel: t('profile.social.tiktok.notConnected'),
        connectLabel: t('profile.social.tiktok.connect'),
        retryLabel: tiktokNeedsRetry
          ? t('profile.social.tiktok.retry')
          : t('profile.social.tiktok.connect'),
        disconnectLabel: t('profile.social.tiktok.disconnect'),
        connectA11y: t('profile.social.tiktok.connectA11y'),
        disconnectA11y: t('profile.social.tiktok.disconnectA11y'),
        onConnect: () => {
          void handleTiktokConnect();
        },
        onDisconnect: handleTiktokDisconnect,
        canonicalUrl: tiktokVerified?.canonicalUrl,
        legacyUrl: tiktokLegacyUrl,
        legacyLabel: t('profile.social.tiktok.legacyStored'),
      })}
      {renderConnectCard({
        id: 'instagram',
        label: instagramLabel,
        connected: instagramConnected,
        locked: instagramActionLocked,
        busy: instagramBusyPhase,
        connectingLabel: t('profile.social.instagram.connecting'),
        disconnectingLabel: t('profile.social.instagram.disconnecting'),
        connectedLabel: t('profile.social.instagram.connected'),
        notConnectedLabel: t('profile.social.instagram.notConnected'),
        connectLabel: t('profile.social.instagram.connect'),
        retryLabel: instagramNeedsRetry
          ? t('profile.social.instagram.retry')
          : t('profile.social.instagram.connect'),
        disconnectLabel: t('profile.social.instagram.disconnect'),
        connectA11y: t('profile.social.instagram.connectA11y'),
        disconnectA11y: t('profile.social.instagram.disconnectA11y'),
        onConnect: () => {
          void handleInstagramConnect();
        },
        onDisconnect: handleInstagramDisconnect,
        hideConnect: instagramBusyPhase === 'pending',
        canonicalUrl: instagramVerified?.canonicalUrl,
        extra: (
          <>
            {instagramBusyPhase === 'pending' && instagramChallenge ? (
              <View style={styles.instagramPending}>
                <Text
                  style={[styles.helperText, { color: palette.textSecondary }]}
                >
                  {t('profile.social.instagram.pendingTitle')}
                </Text>
                <Text
                  selectable
                  accessibilityLabel={t(
                    'profile.social.instagram.shareCodeA11y',
                  )}
                  style={[
                    styles.instagramCode,
                    {
                      color: palette.textPrimary,
                      borderColor: palette.border,
                      backgroundColor: palette.surface,
                    },
                  ]}
                >
                  {instagramChallenge.code}
                </Text>
                <Text
                  style={[styles.helperText, { color: palette.textSecondary }]}
                >
                  {t('profile.social.instagram.pendingBody', {
                    inbox: instagramChallenge.inboxUsername,
                  })}
                </Text>
                <View style={styles.instagramActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagram.shareCodeA11y',
                    )}
                    onPress={handleInstagramShare}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { color: palette.textPrimary },
                      ]}
                    >
                      {t('profile.social.instagram.shareCode')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagram.openInboxA11y',
                    )}
                    onPress={handleInstagramOpen}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.toggleText, { color: palette.surface }]}
                    >
                      {t('profile.social.instagram.openInbox')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {!instagramConnected &&
            instagramBusyPhase !== 'pending' &&
            instagramHint === 'expired' ? (
              <Text style={[styles.helperText, { color: palette.textMuted }]}>
                {t('profile.social.instagram.errors.txExpired')}
              </Text>
            ) : null}
            {!instagramConnected &&
            instagramBusyPhase !== 'pending' &&
            instagramHint === 'conflict' ? (
              <Text style={[styles.helperText, { color: palette.textMuted }]}>
                {t('profile.social.instagram.errors.accountClaimed')}
              </Text>
            ) : null}
            {!instagramConnected &&
            instagramBusyPhase !== 'pending' &&
            instagramLegacyUrl ? (
              <Text style={[styles.helperText, { color: palette.textMuted }]}>
                {t('profile.social.instagram.legacyStored')}
              </Text>
            ) : null}
          </>
        ),
      })}
      {renderConnectCard({
        id: 'x',
        label: xLabel,
        connected: xConnected,
        locked: xActionLocked,
        busy: xBusyPhase,
        connectingLabel: t('profile.social.x.connecting'),
        disconnectingLabel: t('profile.social.x.disconnecting'),
        connectedLabel: t('profile.social.x.connected'),
        notConnectedLabel: t('profile.social.x.notConnected'),
        connectLabel: t('profile.social.x.connect'),
        retryLabel: xNeedsRetry
          ? t('profile.social.x.retry')
          : t('profile.social.x.connect'),
        disconnectLabel: t('profile.social.x.disconnect'),
        connectA11y: t('profile.social.x.connectA11y'),
        disconnectA11y: t('profile.social.x.disconnectA11y'),
        onConnect: () => {
          void handleXConnect();
        },
        onDisconnect: handleXDisconnect,
        canonicalUrl: xVerified?.canonicalUrl,
        legacyUrl: xLegacyUrl,
        legacyLabel: t('profile.social.x.legacyStored'),
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cards: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
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
  glyph: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  toggleBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
  },
  publishLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  channelPicker: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  channelOption: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  instagramPending: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  instagramCode: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 2,
  },
  instagramActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pressed: { opacity: 0.9 },
});
