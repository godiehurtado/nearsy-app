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
import type { ProfileMode } from '../profile/profileModeFields';
import type { CrjSocialFieldErrors } from '../social/socialLinkNormalize';

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

  const isDirty = isPostCrjSocialEditorDirty(snapshotRef.current, draft);
  const validConnectionCount = countValidPostCrjSocialConnections(draft);

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.social.professionalTitle')
      : t('profile.social.personalTitle');

  const connectedCountLabel =
    validConnectionCount === 1
      ? t('profile.social.connectedCountOne')
      : t('profile.social.connectedCount', { count: validConnectionCount });

  const saveButtonLabel =
    validConnectionCount === 1
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
    if (!parsed.ok || !editorUid || !editorMode) {
      setLoadState('blocked');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadState('loading');
        const existing = await getUserProfile(editorUid);
        if (cancelled) return;

        if (!existing || existing.profileSetupCompleted !== true) {
          setLoadState('blocked');
          return;
        }

        const loaded = readPostCrjSocialEditorDraft(
          existing as Record<string, unknown>,
          editorMode,
        );
        snapshotRef.current = loaded;
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
    };
  }, [editorMode, editorUid, parsed.ok]);

  const connectPlatform = (id: PostCrjSocialCardId) => {
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
    if (!editorUid || !editorMode || saving) return;

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
      const valuesForSave = buildValuesForPostCrjSocialSave(draft);
      const patch = buildPostCrjSocialLinksPersistencePatch(
        editorMode,
        valuesForSave,
        draft.custom,
        {
          website: draft.connected.website ? draft.website : '',
        },
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
      POST_CRJ_SOCIAL_CARD_ORDER.map((id) => {
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
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveBtn,
              { backgroundColor: palette.primary },
              saving && styles.disabled,
              pressed && !saving && styles.pressed,
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
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.55 },
});
