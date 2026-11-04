import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firebaseAuth } from '../config/firebaseConfig';
import { getUserProfile } from '../services/firestoreService';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { cardShadow } from '../theme/shadows';
import {
  getCrjSocialPlatform,
  type CrjSocialPlatform,
} from '../social/onboardingSocialCatalog';
import {
  applyManualLinkResult,
  applyOwnershipVerifiedChange,
  countValidPostCrjSocialConnections,
  emptyPostCrjSocialConnectedState,
  parsePostCrjSocialEditorParams,
  POST_CRJ_SOCIAL_CARD_ORDER,
  readPostCrjSocialEditorDraft,
  type AndroidOwnershipCardId,
  type PostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor';
import { isManualSocialLinkId } from '../social/manualSocialLinkCard';
import type { ProfileMode } from '../profile/profileModeFields';
import { ManualSocialLinkCard } from '../components/profile/ManualSocialLinkCard';
import { ManualSocialLinkModal } from '../components/profile/ManualSocialLinkModal';
import {
  SocialPlatformGlyph,
  WEBSITE_SOCIAL_PLATFORM,
} from '../components/profile/SocialPlatformGlyph';
import { useManualSocialLinks } from '../components/profile/useManualSocialLinks';
import { YoutubeOwnershipCard } from '../components/profile/YoutubeOwnershipCard';
import { TiktokOwnershipCard } from '../components/profile/TiktokOwnershipCard';
import { InstagramOwnershipCard } from '../components/profile/InstagramOwnershipCard';
import { XOwnershipCard } from '../components/profile/XOwnershipCard';
type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type LoadState = 'loading' | 'ready' | 'error' | 'blocked';

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
  const persistGenerationRef = useRef(0);
  const editorMode = lockedModeRef.current;
  const editorUid = lockedUidRef.current;

  const [loadState, setLoadState] = useState<LoadState>(
    parsed.ok ? 'loading' : 'blocked',
  );
  const [draft, setDraft] = useState<PostCrjSocialEditorDraft>(() => ({
    values: readPostCrjSocialEditorDraft(null, 'personal').values,
    website: '',
    custom: [],
    connected: emptyPostCrjSocialConnectedState(),
  }));
  const [ownershipVerified, setOwnershipVerified] = useState<
    Partial<Record<AndroidOwnershipCardId, boolean>>
  >({});
  const manualLinks = useManualSocialLinks({
    uid: editorUid,
    mode: editorMode,
    values: {
      facebook: draft.values.facebook ?? '',
      linkedin: draft.values.linkedin ?? '',
      website: draft.website,
    },
    onSaved: (field, url) => {
      setDraft((prev) => applyManualLinkResult(prev, field, url));
    },
  });

  const onYoutubeConnectedChange = useCallback((connected: boolean) => {
    setOwnershipVerified((prev) =>
      applyOwnershipVerifiedChange(prev, 'youtube', connected),
    );
  }, []);
  const onTiktokConnectedChange = useCallback((connected: boolean) => {
    setOwnershipVerified((prev) =>
      applyOwnershipVerifiedChange(prev, 'tiktok', connected),
    );
  }, []);
  const onInstagramConnectedChange = useCallback((connected: boolean) => {
    setOwnershipVerified((prev) =>
      applyOwnershipVerifiedChange(prev, 'instagram', connected),
    );
  }, []);
  const onXConnectedChange = useCallback((connected: boolean) => {
    setOwnershipVerified((prev) =>
      applyOwnershipVerifiedChange(prev, 'x', connected),
    );
  }, []);

  const validConnectionCount = countValidPostCrjSocialConnections(
    draft,
    Platform.OS === 'android' ? ownershipVerified : undefined,
  );

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.social.professionalTitle')
      : t('profile.social.personalTitle');

  const connectedCountLabel =
    validConnectionCount === 1
      ? t('profile.social.connectedCountOne')
      : t('profile.social.connectedCount', { count: validConnectionCount });

  // Only navigates: every operation has already been written when it happened.
  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    if (!parsed.ok || !editorUid || !editorMode) {
      setLoadState('blocked');
      return;
    }

    let cancelled = false;
    const loadGeneration = ++persistGenerationRef.current;
    (async () => {
      try {
        setLoadState('loading');
        const existing = await getUserProfile(editorUid);
        if (cancelled || persistGenerationRef.current !== loadGeneration) return;

        if (!existing || existing.profileSetupCompleted !== true) {
          setLoadState('blocked');
          return;
        }

        const loaded = readPostCrjSocialEditorDraft(
          existing as Record<string, unknown>,
          editorMode,
        );
        // Android ownership cards are not manual URL connect state.
        if (Platform.OS === 'android') {
          loaded.connected.youtube = false;
          loaded.connected.tiktok = false;
          loaded.connected.instagram = false;
          loaded.connected.x = false;
        }
        setDraft(loaded);
        setLoadState('ready');
      } catch {
        if (!cancelled) {
          setLoadState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      persistGenerationRef.current += 1;
    };
  }, [editorMode, editorUid, parsed.ok]);

  const bottomBarInset =
    insets.bottom > 0 ? insets.bottom + spacing.sm : spacing.lg;

  const cardConfigs = useMemo(
    () =>
      POST_CRJ_SOCIAL_CARD_ORDER.map((id) => {
        if (id === 'website') {
          return {
            id,
            platform: WEBSITE_SOCIAL_PLATFORM,
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
      <View style={styles.flex}>
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
            {cardConfigs.map((card) => {
              if (card.id === 'youtube' && Platform.OS === 'android') {
                return (
                  <YoutubeOwnershipCard
                    key={`youtube-${editorMode}`}
                    mode={editorMode!}
                    label={card.label}
                    legacyUrl={draft.values.youtube}
                    onConnectedChange={onYoutubeConnectedChange}
                    glyph={
                      <SocialPlatformGlyph platform={{ ...card.platform, id: card.id }} />
                    }
                  />
                );
              }

              if (card.id === 'tiktok' && Platform.OS === 'android') {
                return (
                  <TiktokOwnershipCard
                    key={`tiktok-${editorMode}`}
                    mode={editorMode!}
                    label={card.label}
                    legacyUrl={draft.values.tiktok}
                    onConnectedChange={onTiktokConnectedChange}
                    glyph={
                      <SocialPlatformGlyph platform={{ ...card.platform, id: card.id }} />
                    }
                  />
                );
              }

              if (card.id === 'instagram' && Platform.OS === 'android') {
                return (
                  <InstagramOwnershipCard
                    key={`instagram-${editorMode}`}
                    mode={editorMode!}
                    label={card.label}
                    legacyUrl={draft.values.instagram}
                    onConnectedChange={onInstagramConnectedChange}
                    glyph={
                      <SocialPlatformGlyph platform={{ ...card.platform, id: card.id }} />
                    }
                  />
                );
              }

              if (card.id === 'x' && Platform.OS === 'android') {
                return (
                  <XOwnershipCard
                    key={`x-${editorMode}`}
                    mode={editorMode!}
                    label={card.label}
                    legacyUrl={draft.values.x}
                    onConnectedChange={onXConnectedChange}
                    glyph={
                      <SocialPlatformGlyph platform={{ ...card.platform, id: card.id }} />
                    }
                  />
                );
              }

              const manualId = card.id;
              if (!isManualSocialLinkId(manualId)) return null;
              return (
                <ManualSocialLinkCard
                  key={manualId}
                  id={manualId}
                  label={card.label}
                  url={
                    manualId === 'website'
                      ? draft.website
                      : (draft.values[manualId] ?? '')
                  }
                  glyph={
                    <SocialPlatformGlyph
                      platform={{ ...card.platform, id: card.id }}
                    />
                  }
                  disabled={manualLinks.busy}
                  removing={manualLinks.busyField === manualId}
                  error={manualLinks.errorFor(manualId)}
                  onOpen={() => manualLinks.open(manualId)}
                  onRemove={() => manualLinks.remove(manualId)}
                />
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
            accessibilityLabel={t('profile.social.backToProfileA11y')}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.bottomBackBtn,
              { backgroundColor: palette.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.bottomBackText, { color: '#FFFFFF' }]}>
              {t('profile.social.back')}
            </Text>
          </Pressable>
        </View>
      </View>
      <ManualSocialLinkModal {...manualLinks.modalProps} />

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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
  },
  bottomBackBtn: {
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  bottomBackText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  pressed: { opacity: 0.9 },
});
