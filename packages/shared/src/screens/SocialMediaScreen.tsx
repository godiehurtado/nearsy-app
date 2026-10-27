import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  AppState,
  Linking,
} from 'react-native';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firebaseAuth } from '../config/firebaseConfig';
import { getUserProfile, updateUserProfilePartial } from '../services/firestoreService';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { cardShadow } from '../theme/shadows';
import {
  getCrjSocialPlatform,
  type CrjSocialPlatform,
  type CrjSocialPlatformId,
} from '../social/onboardingSocialCatalog';
import {
  buildPostCrjSocialLinksPersistencePatch,
  countValidPostCrjSocialConnections,
  emptyPostCrjSocialConnectedState,
  isPostCrjSocialEditorDirty,
  parsePostCrjSocialEditorParams,
  POST_CRJ_SOCIAL_CARD_ORDER,
  readPostCrjSocialEditorDraft,
  validatePostCrjSocialDraftForSave,
  buildValuesForPostCrjSocialSave,
  type PostCrjSocialCardId,
  type PostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor';
import { readExistingSocialLinks } from '../social/onboardingSocialPersistence';
import type { ProfileMode } from '../profile/profileModeFields';
import type { CrjSocialFieldErrors } from '../social/socialLinkNormalize';
import {
  getYoutubeOwnershipClient,
  getYoutubeOwnershipController,
  isYoutubeActionLocked,
  isYoutubeChannelPickLocked,
  logYoutubeOwnershipDev,
  omitYoutubeFromDraftValues,
  preserveLegacyYoutubeInSocialPatch,
  mapYoutubeOwnershipThrowable,
  youtubeConnectedForMode,
  youtubeOwnershipErrorMessageKey,
  YoutubeOwnershipClientError,
  type YoutubeOwnershipBusyPhase,
  type YoutubeOwnershipChannelCandidate,
  type YoutubeOwnershipVerified,
} from '../social/youtubeOwnership';
import {
  getTiktokOwnershipClient,
  getTiktokOwnershipController,
  isTiktokActionLocked,
  logTiktokOwnershipDev,
  omitTiktokFromDraftValues,
  preserveLegacyTiktokInSocialPatch,
  mapTiktokOwnershipThrowable,
  tiktokConnectedForMode,
  tiktokOwnershipErrorMessageKey,
  TiktokOwnershipClientError,
  type TiktokOwnershipBusyPhase,
  type TiktokOwnershipVerified,
} from '../social/tiktokOwnership';
import {
  getInstagramOwnershipClient,
  instagramConnectedForMode,
  instagramOwnershipErrorMessageKey,
  isInstagramActionLocked,
  logInstagramOwnershipDev,
  mapInstagramOwnershipThrowable,
  omitInstagramFromDraftValues,
  preserveLegacyInstagramInSocialPatch,
  resolveInstagramOwnershipClientPlatform,
  presentInstagramGetResponse,
  shareInstagramChallengeCode,
  shouldPollInstagramOwnership,
  shouldShowInstagramInboxAuthorizeOwnerAction,
  openInstagramInboxAuthorizationUrl,
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
  InstagramOwnershipClientError,
  type InstagramGetHint,
  type InstagramOwnershipBusyPhase,
  type InstagramOwnershipPending,
  type InstagramOwnershipVerified,
} from '../social/instagramOwnership';
import {
  getXOwnershipClient,
  getXOwnershipController,
  isXActionLocked,
  logXOwnershipDev,
  omitXFromDraftValues,
  preserveLegacyXInSocialPatch,
  mapXOwnershipThrowable,
  xConnectedForMode,
  xOwnershipErrorMessageKey,
  XOwnershipClientError,
  type XOwnershipBusyPhase,
  type XOwnershipVerified,
} from '../social/xOwnership';

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type LoadState = 'loading' | 'ready' | 'error' | 'blocked';

function PlatformGlyph({
  platform,
}: {
  platform:
    | CrjSocialPlatform
    | {
        ionicon: string;
        iconSet: 'ionicons' | 'fontawesome6';
        color: string;
        id: string;
      };
}) {
  const isLightMark = platform.id === 'snapchat';
  return (
    <View
      style={[
        styles.glyph,
        {
          backgroundColor: platform.color,
          borderColor:
            platform.id === 'x' || platform.id === 'tiktok'
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
          color={isLightMark ? '#111111' : '#FFFFFF'}
        />
      ) : (
        <Ionicons
          name={
            platform.ionicon as React.ComponentProps<typeof Ionicons>['name']
          }
          size={18}
          color={isLightMark ? '#111111' : '#FFFFFF'}
        />
      )}
    </View>
  );
}

const WEBSITE_PLATFORM = {
  id: 'website',
  ionicon: 'globe-outline',
  iconSet: 'ionicons' as const,
  color: '#64748B',
};

export default function SocialMediaScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();

  const params = (route.params ?? {}) as RouteParams;
  const parsed = parsePostCrjSocialEditorParams(
    params as Record<string, unknown>,
    firebaseAuth.currentUser?.uid ?? null,
  );

  const lockedModeRef = useRef<ProfileMode | null>(
    parsed.ok ? parsed.params.mode : null,
  );
  const lockedUidRef = useRef<string | null>(
    parsed.ok ? parsed.params.uid : null,
  );
  const editorMode = lockedModeRef.current;
  const editorUid = lockedUidRef.current;

  const [loadState, setLoadState] = useState<LoadState>(
    parsed.ok ? 'loading' : 'blocked',
  );
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PostCrjSocialEditorDraft>(() => ({
    values: readPostCrjSocialEditorDraft(null, 'personal').values,
    website: '',
    custom: [],
    connected: emptyPostCrjSocialConnectedState(),
  }));
  const snapshotRef = useRef<PostCrjSocialEditorDraft>(draft);
  const [fieldErrors, setFieldErrors] = useState<
    CrjSocialFieldErrors & { website?: string }
  >({});
  const inputRefs = useRef<
    Partial<Record<PostCrjSocialCardId, TextInput | null>>
  >({});
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
  /** Bumps on mode/uid change so late Get/Connect/Unlink results are ignored. */
  const youtubeRequestGenRef = useRef(0);
  const youtubeEditorModeRef = useRef<ProfileMode | null>(editorMode);

  const [tiktokVerified, setTiktokVerified] =
    useState<TiktokOwnershipVerified | null>(null);
  const [tiktokLegacyUrl, setTiktokLegacyUrl] = useState<string | null>(null);
  const [tiktokBusyPhase, setTiktokBusyPhase] =
    useState<TiktokOwnershipBusyPhase>('idle');
  const [tiktokNeedsRetry, setTiktokNeedsRetry] = useState(false);
  const tiktokRequestGenRef = useRef(0);
  const tiktokEditorModeRef = useRef<ProfileMode | null>(editorMode);

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
  const [instagramInboxAuthorizeBusy, setInstagramInboxAuthorizeBusy] =
    useState(false);
  const instagramRequestGenRef = useRef(0);
  const instagramEditorModeRef = useRef<ProfileMode | null>(editorMode);
  const instagramChallengeRef = useRef<InstagramOwnershipPending | null>(null);
  const screenFocused = useIsFocused();

  const [xVerified, setXVerified] = useState<XOwnershipVerified | null>(null);
  const [xLegacyUrl, setXLegacyUrl] = useState<string | null>(null);
  const [xBusyPhase, setXBusyPhase] = useState<XOwnershipBusyPhase>('idle');
  const [xNeedsRetry, setXNeedsRetry] = useState(false);
  const xRequestGenRef = useRef(0);
  const xEditorModeRef = useRef<ProfileMode | null>(editorMode);

  const existingLinksRef = useRef<ReturnType<typeof readExistingSocialLinks> | null>(
    null,
  );
  const youtubeActionLocked = isYoutubeActionLocked(youtubeBusyPhase);
  const youtubeChannelPickLocked = isYoutubeChannelPickLocked(youtubeBusyPhase);
  const youtubeConnected =
    !!editorMode && youtubeConnectedForMode(youtubeVerified, editorMode);
  const tiktokActionLocked = isTiktokActionLocked(tiktokBusyPhase);
  const tiktokConnected =
    !!editorMode && tiktokConnectedForMode(tiktokVerified, editorMode);
  const instagramActionLocked = isInstagramActionLocked(instagramBusyPhase);
  const instagramConnected =
    !!editorMode &&
    instagramConnectedForMode(instagramVerified, editorMode);
  const xActionLocked = isXActionLocked(xBusyPhase);
  const xConnected = !!editorMode && xConnectedForMode(xVerified, editorMode);

  const isDirty = isPostCrjSocialEditorDirty(snapshotRef.current, draft);
  const validConnectionCount = countValidPostCrjSocialConnections(draft, {
    youtubeConnected,
    tiktokConnected,
    instagramConnected,
    xConnected,
  });
  const saveDisabled = saving || !isDirty;

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.social.professionalTitle')
      : t('profile.social.personalTitle');

  const connectedCountLabel =
    validConnectionCount === 1
      ? t('profile.social.connectedCountOne')
      : t('profile.social.connectedCount', { count: validConnectionCount });

  // Ownership persists immediately; only dirty manual links need Save.
  const saveButtonLabel = !isDirty
    ? connectedCountLabel
    : validConnectionCount === 1
      ? t('profile.social.saveConnectionsOne')
      : t('profile.social.saveConnections', { count: validConnectionCount });

  const confirmDiscard = useCallback(
    (onDiscard: () => void) => {
      Alert.alert(
        t('profile.social.discard.title'),
        t('profile.social.discard.body'),
        [
          { text: t('profile.social.discard.stay'), style: 'cancel' },
          {
            text: t('profile.social.discard.discard'),
            style: 'destructive',
            onPress: onDiscard,
          },
        ],
      );
    },
    [t],
  );

  const handleBack = useCallback(() => {
    if (isDirty) {
      confirmDiscard(() => navigation.goBack());
      return;
    }
    navigation.goBack();
  }, [confirmDiscard, isDirty, navigation]);

  useEffect(() => {
    youtubeEditorModeRef.current = editorMode;
    tiktokEditorModeRef.current = editorMode;
    instagramEditorModeRef.current = editorMode;
    xEditorModeRef.current = editorMode;
  }, [editorMode]);
  instagramChallengeRef.current = instagramChallenge;

  useEffect(() => {
    if (!parsed.ok || !editorUid || !editorMode) {
      setLoadState('blocked');
      return;
    }

    const requestGen = ++youtubeRequestGenRef.current;
    tiktokRequestGenRef.current = requestGen;
    instagramRequestGenRef.current = requestGen;
    xRequestGenRef.current = requestGen;
    const modeForRequest = editorMode;
    let cancelled = false;

    // Mode change: drop prior mode UI and in-flight presentation.
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
        setLoadState('loading');
        const existing = await getUserProfile(editorUid);
        if (cancelled || requestGen !== youtubeRequestGenRef.current) return;

        if (!existing || existing.profileSetupCompleted !== true) {
          setLoadState('blocked');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
          setInstagramBusyPhase('idle');
          setXBusyPhase('idle');
          return;
        }

        const loaded = readPostCrjSocialEditorDraft(
          existing as Record<string, unknown>,
          modeForRequest,
        );
        // Pilot: ownership platforms are not manual URL cards.
        loaded.connected.youtube = false;
        loaded.values.youtube = '';
        loaded.connected.tiktok = false;
        loaded.values.tiktok = '';
        loaded.connected.instagram = false;
        loaded.values.instagram = '';
        loaded.connected.x = false;
        loaded.values.x = '';
        const existingLinks = readExistingSocialLinks(
          existing as Record<string, unknown>,
          modeForRequest,
        );
        existingLinksRef.current = existingLinks;
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
        snapshotRef.current = loaded;
        setDraft(loaded);
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
              if (cancelled || requestGen !== xRequestGenRef.current) {
                return;
              }
              if (xEditorModeRef.current !== modeForRequest) return;
              setXVerified(get.result === 'verified' ? get : null);
            } catch {
              if (cancelled || requestGen !== xRequestGenRef.current) {
                return;
              }
              setXVerified(null);
            }
          })(),
        ]);

        if (!cancelled && requestGen === youtubeRequestGenRef.current) {
          setLoadState('ready');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
          setInstagramBusyPhase((phase) =>
            phase === 'pending' ? 'pending' : 'idle',
          );
          setXBusyPhase('idle');
        }
      } catch {
        if (!cancelled && requestGen === youtubeRequestGenRef.current) {
          setLoadState('error');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
          setInstagramBusyPhase('idle');
          setXBusyPhase('idle');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editorMode, editorUid, parsed.ok]);

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
    if (youtubeActionLocked || !editorMode) return;
    const requestGen = youtubeRequestGenRef.current;
    const modeForRequest = editorMode;
    let staySelecting = false;
    try {
      setYoutubeNeedsRetry(false);
      setYoutubeBusyPhase('connecting');
      setYoutubeChannels(null);
      youtubeSelectRef.current = null;
      const controller = await getYoutubeOwnershipController();
      const outcome = await controller.connect(modeForRequest);
      if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
      if (outcome.kind === 'cancelled') {
        return;
      }
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
      // Backend confirmed ownership before updating UI.
      setYoutubeVerified(outcome.verified);
      setYoutubeChannels(null);
      setYoutubeNeedsRetry(false);
    } catch (err) {
      if (!isYoutubeResultCurrent(requestGen, modeForRequest)) return;
      presentYoutubeError(err, () => {
        handleYoutubeConnectRef.current();
      });
    } finally {
      if (
        isYoutubeResultCurrent(requestGen, modeForRequest) &&
        !staySelecting
      ) {
        setYoutubeBusyPhase('idle');
      }
    }
  }, [
    editorMode,
    isYoutubeResultCurrent,
    presentYoutubeError,
    youtubeActionLocked,
  ]);

  handleYoutubeConnectRef.current = () => {
    void handleYoutubeConnect();
  };

  const handleYoutubeSelectChannel = useCallback(
    async (channelId: string) => {
      if (
        youtubeChannelPickLocked ||
        !youtubeSelectRef.current ||
        !editorMode
      ) {
        return;
      }
      const requestGen = youtubeRequestGenRef.current;
      const modeForRequest = editorMode;
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
      editorMode,
      isYoutubeResultCurrent,
      presentYoutubeError,
      youtubeChannelPickLocked,
    ],
  );

  const handleYoutubeDisconnect = useCallback(() => {
    if (youtubeActionLocked || !editorMode) return;
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
              const modeForRequest = editorMode;
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
                // Reconcile with Get before retry UI — Unlink may have failed
                // transport-side while server state changed, or vice versa.
                try {
                  const client = await getYoutubeOwnershipClient();
                  const get = await client.get(modeForRequest);
                  if (!isYoutubeResultCurrent(requestGen, modeForRequest)) {
                    return;
                  }
                  if (get.result === 'verified') {
                    setYoutubeVerified(get);
                  } else {
                    setYoutubeVerified(null);
                    setYoutubeChannels(null);
                    youtubeSelectRef.current = null;
                  }
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
    editorMode,
    isYoutubeResultCurrent,
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
    if (tiktokActionLocked || !editorMode) return;
    const requestGen = tiktokRequestGenRef.current;
    const modeForRequest = editorMode;
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
  }, [
    editorMode,
    isTiktokResultCurrent,
    presentTiktokError,
    tiktokActionLocked,
  ]);

  handleTiktokConnectRef.current = () => {
    void handleTiktokConnect();
  };

  const handleTiktokDisconnect = useCallback(() => {
    if (tiktokActionLocked || !editorMode) return;
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
              const modeForRequest = editorMode;
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
  }, [
    editorMode,
    isTiktokResultCurrent,
    presentTiktokError,
    t,
    tiktokActionLocked,
  ]);

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
    if (instagramActionLocked || !editorMode) return;
    const requestGen = instagramRequestGenRef.current;
    const modeForRequest = editorMode;
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
    editorMode,
    instagramActionLocked,
    isInstagramResultCurrent,
    presentInstagramError,
  ]);

  handleInstagramConnectRef.current = () => {
    void handleInstagramConnect();
  };

  const firebaseJsProjectId =
    (firebaseAuth as { app?: { options?: { projectId?: string } } }).app
      ?.options?.projectId ?? null;

  const showInstagramInboxAuthorizeOwner =
    shouldShowInstagramInboxAuthorizeOwnerAction({
      platform: Platform.OS,
      firebaseEnvironment: process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
      firebaseProjectId: firebaseJsProjectId,
      uid: firebaseAuth.currentUser?.uid ?? null,
    });

  const instagramInboxAuthorizeBusyRef = useRef(false);
  const handleInstagramInboxAuthorizeRef = useRef<() => void>(() => {});

  const handleInstagramInboxAuthorize = useCallback(async () => {
    if (
      !showInstagramInboxAuthorizeOwner ||
      instagramInboxAuthorizeBusyRef.current
    ) {
      return;
    }
    instagramInboxAuthorizeBusyRef.current = true;
    setInstagramInboxAuthorizeBusy(true);
    try {
      const client = await getInstagramOwnershipClient();
      const started = await client.startInboxAuthorize();
      await openInstagramInboxAuthorizationUrl(started.authorizationUrl, {
        canOpenURL: (url) => Linking.canOpenURL(url),
        openURL: (url) => Linking.openURL(url),
      });
    } catch (err) {
      presentInstagramError(err, () => {
        handleInstagramInboxAuthorizeRef.current();
      });
    } finally {
      instagramInboxAuthorizeBusyRef.current = false;
      setInstagramInboxAuthorizeBusy(false);
    }
  }, [presentInstagramError, showInstagramInboxAuthorizeOwner]);

  handleInstagramInboxAuthorizeRef.current = () => {
    void handleInstagramInboxAuthorize();
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
    if (!editorMode) return;
    const pending = instagramBusyPhase === 'pending';
    const expiresAtMs = instagramChallenge?.expiresAt ?? null;
    if (!pending || !screenFocused) return;

    const requestGen = instagramRequestGenRef.current;
    const modeForRequest = editorMode;
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
    editorMode,
    instagramBusyPhase,
    instagramChallenge?.expiresAt,
    isInstagramResultCurrent,
    screenFocused,
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
    if (instagramActionLocked || !editorMode) return;
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
              const modeForRequest = editorMode;
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
    editorMode,
    instagramActionLocked,
    isInstagramResultCurrent,
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
    if (xActionLocked || !editorMode) return;
    const requestGen = xRequestGenRef.current;
    const modeForRequest = editorMode;
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
  }, [editorMode, isXResultCurrent, presentXError, xActionLocked]);

  handleXConnectRef.current = () => {
    void handleXConnect();
  };

  const handleXDisconnect = useCallback(() => {
    if (xActionLocked || !editorMode) return;
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
              const modeForRequest = editorMode;
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
                  if (!isXResultCurrent(requestGen, modeForRequest)) {
                    return;
                  }
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
  }, [editorMode, isXResultCurrent, presentXError, t, xActionLocked]);

  const connectPlatform = (id: PostCrjSocialCardId) => {
    if (
      id === 'youtube' ||
      id === 'tiktok' ||
      id === 'instagram' ||
      id === 'x'
    )
      return;
    setDraft((prev) => ({
      ...prev,
      connected: { ...prev.connected, [id]: true },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id as CrjSocialPlatformId];
      if (id === 'website') delete next.website;
      return next;
    });
    setTimeout(() => {
      inputRefs.current[id]?.focus();
    }, 50);
  };

  const disconnectPlatform = (id: PostCrjSocialCardId) => {
    if (
      id === 'youtube' ||
      id === 'tiktok' ||
      id === 'instagram' ||
      id === 'x'
    )
      return;
    setDraft((prev) => {
      const nextConnected = { ...prev.connected, [id]: false };
      if (id === 'website') {
        return {
          ...prev,
          connected: nextConnected,
          website: '',
        };
      }
      return {
        ...prev,
        connected: nextConnected,
        values: { ...prev.values, [id]: '' },
      };
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id as CrjSocialPlatformId];
      if (id === 'website') delete next.website;
      return next;
    });
  };

  const updatePlatformValue = (id: CrjSocialPlatformId, text: string) => {
    setDraft((prev) => ({
      ...prev,
      values: { ...prev.values, [id]: text },
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateWebsite = (text: string) => {
    setDraft((prev) => ({ ...prev, website: text }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.website;
      return next;
    });
  };

  const handleSave = async () => {
    if (!editorUid || !editorMode || saving || !isDirty) return;

    const validation = validatePostCrjSocialDraftForSave(draft, {
      requiredWhenConnected: t('profile.social.requiredWhenConnected'),
      invalidValue: t('profile.social.invalidValue'),
    });
    if (validation.ok === false) {
      setFieldErrors(validation.errors);
      return;
    }

    try {
      setSaving(true);
      const valuesForSave = omitXFromDraftValues(
        omitInstagramFromDraftValues(
          omitTiktokFromDraftValues(
            omitYoutubeFromDraftValues(buildValuesForPostCrjSocialSave(draft)),
          ),
        ),
      );
      const patch = preserveLegacyXInSocialPatch(
        editorMode,
        preserveLegacyInstagramInSocialPatch(
          editorMode,
          preserveLegacyTiktokInSocialPatch(
            editorMode,
            preserveLegacyYoutubeInSocialPatch(
              editorMode,
              buildPostCrjSocialLinksPersistencePatch(
                editorMode,
                valuesForSave,
                draft.custom,
                {
                  website: draft.connected.website ? draft.website : '',
                  existing: existingLinksRef.current,
                },
              ),
              existingLinksRef.current,
            ),
            existingLinksRef.current,
          ),
          existingLinksRef.current,
        ),
        existingLinksRef.current,
      );
      await updateUserProfilePartial(editorUid, patch);
      snapshotRef.current = draft;
      Keyboard.dismiss();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(
        t('common.error'),
        e?.message || t('profile.social.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const bottomBarInset =
    insets.bottom > 0 ? insets.bottom + spacing.sm : spacing.lg;

  const cardConfigs = useMemo(
    () =>
      POST_CRJ_SOCIAL_CARD_ORDER.filter(
        (id) =>
          id !== 'youtube' &&
          id !== 'tiktok' &&
          id !== 'instagram' &&
          id !== 'x' &&
          id !== 'snapchat',
      ).map((id) => {
        if (id === 'website') {
          return {
            id,
            platform: WEBSITE_PLATFORM,
            label: t('profile.social.platforms.website'),
            placeholder: t('profile.social.placeholders.website'),
          };
        }
        const platform = getCrjSocialPlatform(id);
        return {
          id,
          platform,
          label: t(
            `onboarding.profileCompletion.socialMedia.platforms.${platform.nameKey}` as any,
          ),
          placeholder: t(
            `onboarding.profileCompletion.socialMedia.placeholders.${platform.placeholderKey}` as any,
          ),
        };
      }),
    [t],
  );

  const youtubePlatform = getCrjSocialPlatform('youtube');
  const youtubeLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.${youtubePlatform.nameKey}` as any,
  );
  const tiktokPlatform = getCrjSocialPlatform('tiktok');
  const tiktokLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.${tiktokPlatform.nameKey}` as any,
  );
  const instagramPlatform = getCrjSocialPlatform('instagram');
  const instagramLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.${instagramPlatform.nameKey}` as any,
  );
  const xPlatform = getCrjSocialPlatform('x');
  const xLabel = t(
    `onboarding.profileCompletion.socialMedia.platforms.${xPlatform.nameKey}` as any,
  );

  if (!parsed.ok || loadState === 'blocked') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={[styles.errorText, { color: palette.textSecondary }]}>
            {t('profile.social.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.social.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.panel,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.social.backA11y')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loadState === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View
          style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('profile.social.loading')}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
            {t('profile.social.loading')}
          </Text>
        </View>
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
          <Text
            accessibilityRole="alert"
            style={[styles.errorText, { color: palette.textSecondary }]}
          >
            {t('profile.social.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.social.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.panel,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.social.backA11y')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: insets.top + spacing.md,
            paddingBottom: 120 + bottomBarInset,
          }}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ top: insets.top }}
        >
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.social.backA11y')}
              onPress={handleBack}
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerBack,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={palette.textPrimary}
              />
            </Pressable>

            <View style={styles.headerTextCol}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: palette.textPrimary }]}
              >
                {screenTitle}
              </Text>
              <Text
                style={[
                  styles.connectedSubtitle,
                  { color: palette.textSecondary },
                ]}
              >
                {connectedCountLabel}
              </Text>
            </View>

            <View
              accessibilityLabel={connectedCountLabel}
              accessibilityRole="text"
              style={[
                styles.countBadge,
                { backgroundColor: palette.chipBg },
              ]}
            >
              <Text style={[styles.countBadgeText, { color: palette.primary }]}>
                {validConnectionCount}
              </Text>
            </View>
          </View>

          <Text style={[styles.description, { color: palette.textSecondary }]}>
            {t('profile.social.description')}
          </Text>

          <View style={styles.cards}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.panel,
                  borderColor: youtubeConnected
                    ? palette.primary
                    : palette.border,
                  borderWidth: youtubeConnected ? 1.5 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <PlatformGlyph
                  platform={{ ...youtubePlatform, id: 'youtube' }}
                />
                <View style={styles.cardTextCol}>
                  <Text
                    style={[styles.platformName, { color: palette.textPrimary }]}
                  >
                    {youtubeLabel}
                  </Text>
                  {youtubeBusyPhase === 'connecting' ||
                  youtubeBusyPhase === 'disconnecting' ? (
                    <Text
                      style={[styles.notConnected, { color: palette.textMuted }]}
                    >
                      {youtubeBusyPhase === 'disconnecting'
                        ? t('profile.social.youtube.disconnecting')
                        : t('profile.social.youtube.connecting')}
                    </Text>
                  ) : youtubeConnected ? (
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
                        style={[
                          styles.connectedLabel,
                          { color: palette.success },
                        ]}
                      >
                        {t('profile.social.youtube.connected')}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.notConnected, { color: palette.textMuted }]}
                    >
                      {t('profile.social.youtube.notConnected')}
                    </Text>
                  )}
                </View>
                {youtubeConnected ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.youtube.disconnectA11y',
                    )}
                    disabled={youtubeActionLocked}
                    onPress={handleYoutubeDisconnect}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: 'transparent',
                        borderColor: palette.danger,
                        opacity: youtubeActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: palette.danger }]}>
                      {youtubeBusyPhase === 'disconnecting'
                        ? t('profile.social.youtube.disconnecting')
                        : t('profile.social.youtube.disconnect')}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.social.youtube.connectA11y')}
                    disabled={youtubeActionLocked}
                    onPress={() => {
                      void handleYoutubeConnect();
                    }}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                        opacity: youtubeActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.toggleText, { color: palette.surface }]}
                    >
                      {youtubeBusyPhase === 'connecting'
                        ? t('profile.social.youtube.connecting')
                        : youtubeNeedsRetry
                          ? t('profile.social.youtube.retry')
                          : t('profile.social.youtube.connect')}
                    </Text>
                  </Pressable>
                )}
              </View>

              {youtubeConnected && youtubeVerified ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: palette.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {youtubeVerified.canonicalUrl}
                </Text>
              ) : null}

              {!youtubeConnected && youtubeLegacyUrl ? (
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.youtube.legacyStored')}
                </Text>
              ) : null}

              {youtubeChannels && youtubeChannels.length > 0 ? (
                <View style={styles.channelPicker}>
                  <Text
                    style={[
                      styles.platformName,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {t('profile.social.youtube.selectChannelTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.helperText,
                      { color: palette.textSecondary },
                    ]}
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
                        {channel.title?.trim() || channel.channelId}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.panel,
                  borderColor: tiktokConnected
                    ? palette.primary
                    : palette.border,
                  borderWidth: tiktokConnected ? 1.5 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <PlatformGlyph
                  platform={{ ...tiktokPlatform, id: 'tiktok' }}
                />
                <View style={styles.cardTextCol}>
                  <Text
                    style={[
                      styles.platformName,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {tiktokLabel}
                  </Text>
                  {tiktokBusyPhase === 'connecting' ||
                  tiktokBusyPhase === 'disconnecting' ? (
                    <Text
                      style={[styles.connectedLabel, { color: palette.textMuted }]}
                    >
                      {tiktokBusyPhase === 'disconnecting'
                        ? t('profile.social.tiktok.disconnecting')
                        : t('profile.social.tiktok.connecting')}
                    </Text>
                  ) : tiktokConnected ? (
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
                        style={[
                          styles.connectedLabel,
                          { color: palette.success },
                        ]}
                      >
                        {t('profile.social.tiktok.connected')}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.notConnected, { color: palette.textMuted }]}
                    >
                      {t('profile.social.tiktok.notConnected')}
                    </Text>
                  )}
                </View>
                {tiktokConnected ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.tiktok.disconnectA11y',
                    )}
                    disabled={tiktokActionLocked}
                    onPress={handleTiktokDisconnect}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: 'transparent',
                        borderColor: palette.danger,
                        opacity: tiktokActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: palette.danger }]}>
                      {tiktokBusyPhase === 'disconnecting'
                        ? t('profile.social.tiktok.disconnecting')
                        : t('profile.social.tiktok.disconnect')}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.social.tiktok.connectA11y')}
                    disabled={tiktokActionLocked}
                    onPress={() => {
                      void handleTiktokConnect();
                    }}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                        opacity: tiktokActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.toggleText, { color: palette.surface }]}
                    >
                      {tiktokBusyPhase === 'connecting'
                        ? t('profile.social.tiktok.connecting')
                        : tiktokNeedsRetry
                          ? t('profile.social.tiktok.retry')
                          : t('profile.social.tiktok.connect')}
                    </Text>
                  </Pressable>
                )}
              </View>

              {tiktokConnected && tiktokVerified ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: palette.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {tiktokVerified.canonicalUrl}
                </Text>
              ) : null}

              {!tiktokConnected && tiktokLegacyUrl ? (
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.tiktok.legacyStored')}
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.panel,
                  borderColor: instagramConnected
                    ? palette.primary
                    : palette.border,
                  borderWidth: instagramConnected ? 1.5 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <PlatformGlyph
                  platform={{ ...instagramPlatform, id: 'instagram' }}
                />
                <View style={styles.cardTextCol}>
                  <Text
                    style={[
                      styles.platformName,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {instagramLabel}
                  </Text>
                  {instagramBusyPhase === 'connecting' ||
                  instagramBusyPhase === 'disconnecting' ? (
                    <Text
                      style={[styles.connectedLabel, { color: palette.textMuted }]}
                    >
                      {instagramBusyPhase === 'disconnecting'
                        ? t('profile.social.instagram.disconnecting')
                        : t('profile.social.instagram.connecting')}
                    </Text>
                  ) : instagramBusyPhase === 'pending' ? (
                    <Text
                      style={[styles.connectedLabel, { color: palette.textMuted }]}
                    >
                      {t('profile.social.instagram.waiting')}
                    </Text>
                  ) : instagramConnected ? (
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
                        style={[
                          styles.connectedLabel,
                          { color: palette.success },
                        ]}
                      >
                        {t('profile.social.instagram.connected')}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.notConnected, { color: palette.textMuted }]}
                    >
                      {t('profile.social.instagram.notConnected')}
                    </Text>
                  )}
                </View>
                {instagramConnected ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagram.disconnectA11y',
                    )}
                    disabled={instagramActionLocked}
                    onPress={handleInstagramDisconnect}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: 'transparent',
                        borderColor: palette.danger,
                        opacity: instagramActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: palette.danger }]}>
                      {instagramBusyPhase === 'disconnecting'
                        ? t('profile.social.instagram.disconnecting')
                        : t('profile.social.instagram.disconnect')}
                    </Text>
                  </Pressable>
                ) : instagramBusyPhase === 'pending' ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'profile.social.instagram.connectA11y',
                    )}
                    disabled={instagramActionLocked}
                    onPress={() => {
                      void handleInstagramConnect();
                    }}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                        opacity: instagramActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.toggleText, { color: palette.surface }]}
                    >
                      {instagramBusyPhase === 'connecting'
                        ? t('profile.social.instagram.connecting')
                        : instagramNeedsRetry
                          ? t('profile.social.instagram.retry')
                          : t('profile.social.instagram.connect')}
                    </Text>
                  </Pressable>
                )}
              </View>

              {instagramConnected && instagramVerified ? (
                <Text
                  style={[
                    styles.helperText,
                    { color: palette.textSecondary },
                  ]}
                  numberOfLines={2}
                >
                  {instagramVerified.canonicalUrl}
                </Text>
              ) : null}

              {instagramBusyPhase === 'pending' && instagramChallenge ? (
                <View style={styles.instagramPending}>
                  <Text
                    style={[
                      styles.helperText,
                      { color: palette.textSecondary },
                    ]}
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
                    style={[
                      styles.helperText,
                      { color: palette.textSecondary },
                    ]}
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
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.instagram.errors.txExpired')}
                </Text>
              ) : null}

              {!instagramConnected &&
              instagramBusyPhase !== 'pending' &&
              instagramHint === 'conflict' ? (
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.instagram.errors.accountClaimed')}
                </Text>
              ) : null}

              {!instagramConnected &&
              instagramBusyPhase !== 'pending' &&
              instagramLegacyUrl ? (
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.instagram.legacyStored')}
                </Text>
              ) : null}
            </View>

            {showInstagramInboxAuthorizeOwner ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.panel,
                    borderColor: palette.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[styles.platformName, { color: palette.textPrimary }]}
                >
                  {t('profile.social.instagram.inboxAuthorizeTitle')}
                </Text>
                <Text
                  style={[styles.helperText, { color: palette.textSecondary }]}
                >
                  {t('profile.social.instagram.inboxAuthorizeHint')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'profile.social.instagram.inboxAuthorizeA11y',
                  )}
                  disabled={instagramInboxAuthorizeBusy}
                  onPress={() => {
                    void handleInstagramInboxAuthorize();
                  }}
                  style={({ pressed }) => [
                    styles.toggleBtn,
                    {
                      marginTop: spacing.sm,
                      alignSelf: 'flex-start',
                      backgroundColor: palette.primary,
                      borderColor: palette.primary,
                      opacity: instagramInboxAuthorizeBusy ? 0.5 : 1,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.toggleText, { color: palette.surface }]}
                  >
                    {instagramInboxAuthorizeBusy
                      ? t('profile.social.instagram.inboxAuthorizeBusy')
                      : t('profile.social.instagram.inboxAuthorize')}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View
              style={[
                styles.card,
                {
                  backgroundColor: palette.panel,
                  borderColor: xConnected ? palette.primary : palette.border,
                  borderWidth: xConnected ? 1.5 : 1,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <PlatformGlyph platform={{ ...xPlatform, id: 'x' }} />
                <View style={styles.cardTextCol}>
                  <Text
                    style={[
                      styles.platformName,
                      { color: palette.textPrimary },
                    ]}
                  >
                    {xLabel}
                  </Text>
                  {xBusyPhase === 'connecting' ||
                  xBusyPhase === 'disconnecting' ? (
                    <Text
                      style={[styles.connectedLabel, { color: palette.textMuted }]}
                    >
                      {xBusyPhase === 'disconnecting'
                        ? t('profile.social.x.disconnecting')
                        : t('profile.social.x.connecting')}
                    </Text>
                  ) : xConnected ? (
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
                        style={[
                          styles.connectedLabel,
                          { color: palette.success },
                        ]}
                      >
                        {t('profile.social.x.connected')}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={[styles.notConnected, { color: palette.textMuted }]}
                    >
                      {t('profile.social.x.notConnected')}
                    </Text>
                  )}
                </View>
                {xConnected ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.social.x.disconnectA11y')}
                    disabled={xActionLocked}
                    onPress={handleXDisconnect}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: 'transparent',
                        borderColor: palette.danger,
                        opacity: xActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.toggleText, { color: palette.danger }]}>
                      {xBusyPhase === 'disconnecting'
                        ? t('profile.social.x.disconnecting')
                        : t('profile.social.x.disconnect')}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.social.x.connectA11y')}
                    disabled={xActionLocked}
                    onPress={() => {
                      void handleXConnect();
                    }}
                    style={({ pressed }) => [
                      styles.toggleBtn,
                      {
                        backgroundColor: palette.primary,
                        borderColor: palette.primary,
                        opacity: xActionLocked ? 0.5 : 1,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[styles.toggleText, { color: palette.surface }]}
                    >
                      {xBusyPhase === 'connecting'
                        ? t('profile.social.x.connecting')
                        : xNeedsRetry
                          ? t('profile.social.x.retry')
                          : t('profile.social.x.connect')}
                    </Text>
                  </Pressable>
                )}
              </View>

              {xConnected && xVerified ? (
                <Text
                  style={[styles.helperText, { color: palette.textSecondary }]}
                  numberOfLines={2}
                >
                  {xVerified.canonicalUrl}
                </Text>
              ) : null}

              {!xConnected && xLegacyUrl ? (
                <Text
                  style={[styles.helperText, { color: palette.textMuted }]}
                >
                  {t('profile.social.x.legacyStored')}
                </Text>
              ) : null}
            </View>

            {cardConfigs.map((card) => {
              const connected = draft.connected[card.id];
              const error =
                card.id === 'website'
                  ? fieldErrors.website
                  : fieldErrors[card.id as CrjSocialPlatformId];
              const value =
                card.id === 'website'
                  ? draft.website
                  : draft.values[card.id as CrjSocialPlatformId];

              return (
                <View
                  key={card.id}
                  style={[
                    styles.card,
                    {
                      backgroundColor: palette.panel,
                      borderColor: connected ? palette.primary : palette.border,
                      borderWidth: connected ? 1.5 : 1,
                    },
                  ]}
                >
                  <View style={styles.cardTopRow}>
                    <PlatformGlyph platform={{ ...card.platform, id: card.id }} />
                    <View style={styles.cardTextCol}>
                      <Text
                        style={[
                          styles.platformName,
                          { color: palette.textPrimary },
                        ]}
                      >
                        {card.label}
                      </Text>
                      {connected ? (
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
                            style={[
                              styles.connectedLabel,
                              { color: palette.success },
                            ]}
                          >
                            {t('profile.social.connected')}
                          </Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.notConnected,
                            { color: palette.textMuted },
                          ]}
                        >
                          {t('profile.social.notConnected')}
                        </Text>
                      )}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        connected
                          ? t('profile.social.disconnectA11y', {
                              platform: card.label,
                            })
                          : t('profile.social.connectA11y', {
                              platform: card.label,
                            })
                      }
                      accessibilityState={{ selected: connected }}
                      onPress={() =>
                        connected
                          ? disconnectPlatform(card.id)
                          : connectPlatform(card.id)
                      }
                      style={({ pressed }) => [
                        styles.toggleBtn,
                        connected
                          ? {
                              backgroundColor: 'transparent',
                              borderColor: palette.danger,
                            }
                          : {
                              backgroundColor: palette.primary,
                              borderColor: palette.primary,
                            },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.toggleText,
                          {
                            color: connected ? palette.danger : palette.surface,
                          },
                        ]}
                      >
                        {connected
                          ? t('profile.social.disconnect')
                          : t('profile.social.connect')}
                      </Text>
                    </Pressable>
                  </View>

                  {connected ? (
                    <>
                      <TextInput
                        ref={(ref) => {
                          inputRefs.current[card.id] = ref;
                        }}
                        value={value}
                        onChangeText={(text) =>
                          card.id === 'website'
                            ? updateWebsite(text)
                            : updatePlatformValue(
                                card.id as CrjSocialPlatformId,
                                text,
                              )
                        }
                        placeholder={card.placeholder}
                        placeholderTextColor={palette.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        accessibilityLabel={t('profile.social.inputA11y', {
                          platform: card.label,
                        })}
                        style={[
                          styles.input,
                          {
                            color: palette.textPrimary,
                            borderColor: error ? palette.danger : palette.border,
                            backgroundColor: palette.surface,
                          },
                        ]}
                      />
                      {error ? (
                        <Text
                          accessibilityRole="alert"
                          style={[styles.fieldError, { color: palette.danger }]}
                        >
                          {error}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: bottomBarInset,
            },
            cardShadow,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saveButtonLabel}
            accessibilityState={{ disabled: saveDisabled, busy: saving }}
            disabled={saveDisabled}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: palette.primary },
              saveDisabled && styles.disabled,
              pressed && !saveDisabled && styles.pressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={palette.surface} />
            ) : (
              <Text style={[styles.saveText, { color: palette.surface }]}>
                {saveButtonLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <View
        pointerEvents="none"
        style={[
          styles.statusBarOverlay,
          {
            height: insets.top,
            backgroundColor: palette.background,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  statusBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding.horizontal,
  },
  loadingText: { fontSize: fontSize.md },
  errorText: {
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: fontSize.md * 1.4,
  },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.sm,
  },
  headerBack: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
  },
  connectedSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  countBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  description: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.lg,
  },
  cards: {
    gap: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
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
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  fieldError: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
  },
  saveBtn: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  helperText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.35,
  },
  publishRow: {
    marginTop: spacing.sm,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  disabled: { opacity: 0.55 },
});
