import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firebaseAuth } from '../config/firebaseConfig';
import { getUserProfile, updateUserProfilePartial } from '../services/firestoreService';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { cardShadow } from '../theme/shadows';
import { OnboardingAffiliationCategoryPanel } from '../components/registration/OnboardingAffiliationCategoryPanel';
import {
  listOnboardingAffiliationCategoryIds,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from '../affiliations/onboardingAffiliationCatalog';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import {
  isPostCrjAffiliationEditorDirty,
  parsePostCrjAffiliationEditorParams,
  readAffiliationsForPostCrjEditor,
} from '../affiliations/postCrjAffiliationEditor';
import {
  resolvePendingAffiliationSearchUi,
  type AffiliationSearchUiSnapshot,
} from '../affiliations/affiliationSearchInteraction';
import type { ProfileMode } from '../profile/profileModeFields';

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type LoadState = 'loading' | 'ready' | 'error' | 'blocked';

export default function AffiliationsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const scrollRef = useRef<ScrollView | null>(null);

  const params = (route.params ?? {}) as RouteParams;
  const parsed = parsePostCrjAffiliationEditorParams(
    params as Record<string, unknown>,
    firebaseAuth.currentUser?.uid ?? null,
  );

  const lockedModeRef = useRef<ProfileMode | null>(
    parsed.ok ? parsed.params.mode : null,
  );
  const lockedUidRef = useRef<string | null>(parsed.ok ? parsed.params.uid : null);
  const editorMode = lockedModeRef.current;
  const editorUid = lockedUidRef.current;

  const [loadState, setLoadState] = useState<LoadState>(
    parsed.ok ? 'loading' : 'blocked',
  );
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<OnboardingSelectedAffiliation[]>([]);
  const snapshotRef = useRef<OnboardingSelectedAffiliation[]>([]);
  const [searchUiByCategory, setSearchUiByCategory] = useState<
    Partial<Record<OnboardingAffiliationCategoryId, AffiliationSearchUiSnapshot>>
  >({});
  const addByCategoryRef = useRef<
    Partial<
      Record<
        OnboardingAffiliationCategoryId,
        React.MutableRefObject<(() => void) | null>
      >
    >
  >({});

  const getAddRef = (
    categoryId: OnboardingAffiliationCategoryId,
  ): React.MutableRefObject<(() => void) | null> => {
    const existing = addByCategoryRef.current[categoryId];
    if (existing) return existing;
    const created: React.MutableRefObject<(() => void) | null> = {
      current: null,
    };
    addByCategoryRef.current[categoryId] = created;
    return created;
  };

  const aboveCategoriesHeightRef = useRef(0);
  const categoryLocalYRef = useRef(
    {} as Partial<Record<OnboardingAffiliationCategoryId, number>>,
  );
  const scrollAnchorByCategoryRef = useRef(
    {} as Partial<
      Record<OnboardingAffiliationCategoryId, React.MutableRefObject<number>>
    >,
  );

  const getScrollAnchorRef = (
    categoryId: OnboardingAffiliationCategoryId,
  ): React.MutableRefObject<number> => {
    const existing = scrollAnchorByCategoryRef.current[categoryId];
    if (existing) return existing;
    const created: React.MutableRefObject<number> = { current: 0 };
    scrollAnchorByCategoryRef.current[categoryId] = created;
    return created;
  };

  const syncScrollAnchor = (categoryId: OnboardingAffiliationCategoryId) => {
    getScrollAnchorRef(categoryId).current =
      aboveCategoriesHeightRef.current +
      (categoryLocalYRef.current[categoryId] ?? 0);
  };

  const categoryIds = useMemo(() => listOnboardingAffiliationCategoryIds(), []);
  const pendingSearch = resolvePendingAffiliationSearchUi(
    searchUiByCategory,
    categoryIds,
  );
  const showAddCta = Boolean(pendingSearch);
  const selectedCount = selected.length;
  const isDirty = isPostCrjAffiliationEditorDirty(snapshotRef.current, selected);

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.affiliations.professionalTitle')
      : t('profile.affiliations.personalTitle');

  const confirmDiscard = useCallback(
    (onDiscard: () => void) => {
      Alert.alert(
        t('profile.affiliations.discard.title'),
        t('profile.affiliations.discard.body'),
        [
          { text: t('profile.affiliations.discard.stay'), style: 'cancel' },
          {
            text: t('profile.affiliations.discard.discard'),
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

        const loaded = readAffiliationsForPostCrjEditor(
          existing as Record<string, unknown>,
          editorMode,
        );
        snapshotRef.current = loaded.affiliations;
        setSelected(loaded.affiliations);
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

  const handleAddPending = () => {
    if (!pendingSearch || saving) return;
    addByCategoryRef.current[pendingSearch.categoryId]?.current?.();
  };

  const handleSave = async () => {
    if (!editorUid || !editorMode || saving) return;

    try {
      setSaving(true);
      const patch = buildPostCrjAffiliationPersistencePatch(editorMode, selected);
      await updateUserProfilePartial(editorUid, patch);
      snapshotRef.current = selected;
      Keyboard.dismiss();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(
        t('common.error'),
        e?.message || t('profile.affiliations.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const bottomBarInset =
    insets.bottom > 0 ? insets.bottom + spacing.sm : spacing.lg;

  if (!parsed.ok || loadState === 'blocked') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={[styles.errorText, { color: palette.textSecondary }]}>
            {t('profile.affiliations.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.affiliations.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.panel },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.affiliations.backA11y')}
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
          accessibilityLabel={t('profile.affiliations.loading')}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
            {t('profile.affiliations.loading')}
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
            {t('profile.affiliations.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.affiliations.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.panel },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.affiliations.backA11y')}
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
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: insets.top + spacing.md,
            paddingBottom: 120 + bottomBarInset,
          }}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ top: insets.top }}
        >
          <View
            onLayout={(e) => {
              aboveCategoriesHeightRef.current = e.nativeEvent.layout.height;
              for (const id of categoryIds) {
                syncScrollAnchor(id);
              }
            }}
          >
            <View style={styles.headerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('profile.affiliations.backA11y')}
                onPress={handleBack}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.headerBack,
                  { backgroundColor: palette.panel, borderColor: palette.border },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={palette.textPrimary}
                />
              </Pressable>
            </View>

            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.textPrimary }]}
            >
              {screenTitle}
            </Text>
            <Text style={[styles.description, { color: palette.textSecondary }]}>
              {t('profile.affiliations.description')}
            </Text>
            <Text style={[styles.selectedSummary, { color: palette.textMuted }]}>
              {t('profile.affiliations.selectedCount', { count: selectedCount })}
            </Text>

            {selectedCount === 0 ? (
              <Text style={[styles.emptyHint, { color: palette.textSecondary }]}>
                {t('profile.affiliations.empty')}
              </Text>
            ) : null}
          </View>

          <View style={styles.categories}>
            {categoryIds.map((categoryId) => (
              <View
                key={categoryId}
                style={styles.categorySection}
                onLayout={(e) => {
                  categoryLocalYRef.current[categoryId] =
                    e.nativeEvent.layout.y;
                  syncScrollAnchor(categoryId);
                }}
              >
                <OnboardingAffiliationCategoryPanel
                  categoryId={categoryId}
                  selected={selected}
                  onChangeSelected={setSelected}
                  onSearchUiChange={(ui) => {
                    setSearchUiByCategory((prev) => ({
                      ...prev,
                      [categoryId]: ui,
                    }));
                  }}
                  searchAddRef={getAddRef(categoryId)}
                  contentScrollRef={scrollRef}
                  scrollAnchorYRef={getScrollAnchorRef(categoryId)}
                  removeAffiliationAccessibilityLabel={(name) =>
                    t('profile.affiliations.removeA11y', { name })
                  }
                />
              </View>
            ))}
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
            accessibilityLabel={
              showAddCta
                ? pendingSearch?.ui.addName
                  ? t(
                      'onboarding.profileCompletion.affiliations.addA11y' as any,
                      { name: pendingSearch.ui.addName },
                    )
                  : t('onboarding.profileCompletion.affiliations.add' as any)
                : t('profile.affiliations.saveA11y')
            }
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={showAddCta ? handleAddPending : handleSave}
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
              <>
                <Ionicons
                  name={showAddCta ? 'add' : 'save-outline'}
                  size={18}
                  color={palette.surface}
                />
                <Text style={[styles.saveText, { color: palette.surface }]}>
                  {showAddCta
                    ? t('onboarding.profileCompletion.affiliations.add' as any)
                    : t('profile.affiliations.save')}
                </Text>
              </>
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
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
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
  loadingText: {
    fontSize: fontSize.md,
  },
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
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.xs,
  },
  description: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.sm,
  },
  selectedSummary: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.md,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    paddingHorizontal: screenPadding.horizontal,
    marginBottom: spacing.md,
  },
  categories: {
    gap: spacing.xxl,
    paddingHorizontal: screenPadding.horizontal,
  },
  categorySection: {
    gap: spacing.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.55,
  },
});
