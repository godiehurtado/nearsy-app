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
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
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

  const isDirty = isPostCrjSocialEditorDirty(snapshotRef.current, draft);
  const validConnectionCount = countValidPostCrjSocialConnections(draft, {
    youtubeConnected,
    tiktokConnected,
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
  }, [editorMode]);

  useEffect(() => {
    if (!parsed.ok || !editorUid || !editorMode) {
      setLoadState('blocked');
      return;
    }

    const requestGen = ++youtubeRequestGenRef.current;
    tiktokRequestGenRef.current = requestGen;
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

    (async () => {
      try {
        setLoadState('loading');
        const existing = await getUserProfile(editorUid);
        if (cancelled || requestGen !== youtubeRequestGenRef.current) return;

        if (!existing || existing.profileSetupCompleted !== true) {
          setLoadState('blocked');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
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
        snapshotRef.current = loaded;
        setDraft(loaded);
        setYoutubeLegacyUrl(youtubeLegacy || null);
        setTiktokLegacyUrl(tiktokLegacy || null);

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
        ]);

        if (!cancelled && requestGen === youtubeRequestGenRef.current) {
          setLoadState('ready');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
        }
      } catch {
        if (!cancelled && requestGen === youtubeRequestGenRef.current) {
          setLoadState('error');
          setYoutubeBusyPhase('idle');
          setTiktokBusyPhase('idle');
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

  const connectPlatform = (id: PostCrjSocialCardId) => {
    if (id === 'youtube' || id === 'tiktok') return;
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
    if (id === 'youtube' || id === 'tiktok') return;
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
      const valuesForSave = omitTiktokFromDraftValues(
        omitYoutubeFromDraftValues(buildValuesForPostCrjSocialSave(draft)),
      );
      const patch = preserveLegacyTiktokInSocialPatch(
        editorMode,
        preserveLegacyYoutubeInSocialPatch(
          editorMode,
          buildPostCrjSocialLinksPersistencePatch(
            editorMode,
            valuesForSave,
            draft.custom,
            {
              website: draft.connected.website ? draft.website : '',
            },
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
        (id) => id !== 'youtube' && id !== 'tiktok',
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
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.55 },
});
