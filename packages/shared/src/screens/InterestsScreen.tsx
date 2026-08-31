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
import { OnboardingInterestCategoryPanel } from '../components/registration/OnboardingInterestCategoryPanel';
import {
  buildPostCrjInterestPersistencePatch,
  countFinalOnboardingInterests,
  getOnboardingCategory,
  listOnboardingCategoryIds,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  isPostCrjInterestEditorDirty,
  parsePostCrjInterestEditorParams,
  readOnboardingInterestsFromDoc,
} from '../interests/postCrjInterestEditor';
import type { ProfileMode } from '../profile/profileModeFields';
import {
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from '../interests/interestHierarchy';

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type LoadState = 'loading' | 'ready' | 'error' | 'blocked';

export default function InterestsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();

  const params = (route.params ?? {}) as RouteParams;
  const parsed = parsePostCrjInterestEditorParams(
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
  const [selected, setSelected] = useState<OnboardingSelectedInterest[]>([]);
  const snapshotRef = useRef<OnboardingSelectedInterest[]>([]);
  const [activeInterestGroupByCategory, setActiveInterestGroupByCategory] =
    useState<Partial<Record<OnboardingInterestCategoryId, string>>>({});

  const categoryIds = useMemo(() => listOnboardingCategoryIds(), []);
  const selectedCount = countFinalOnboardingInterests(selected);
  const isDirty = isPostCrjInterestEditorDirty(snapshotRef.current, selected);

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.interests.professionalTitle')
      : t('profile.interests.personalTitle');

  const confirmDiscard = useCallback(
    (onDiscard: () => void) => {
      Alert.alert(
        t('profile.interests.discard.title'),
        t('profile.interests.discard.body'),
        [
          { text: t('profile.interests.discard.stay'), style: 'cancel' },
          {
            text: t('profile.interests.discard.discard'),
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

        const loaded = readOnboardingInterestsFromDoc(
          existing as Record<string, unknown>,
          editorMode,
        );
        snapshotRef.current = loaded;
        setSelected(loaded);
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

  const handleSave = async () => {
    if (!editorUid || !editorMode || saving) return;

    try {
      setSaving(true);
      const patch = buildPostCrjInterestPersistencePatch(editorMode, selected);
      await updateUserProfilePartial(editorUid, patch);
      snapshotRef.current = selected;
      Keyboard.dismiss();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(
        t('common.error'),
        e?.message || t('profile.interests.saveError'),
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
            {t('profile.interests.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.interests.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.panel },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.interests.backA11y')}
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
          accessibilityLabel={t('profile.interests.loading')}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
            {t('profile.interests.loading')}
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
            {t('profile.interests.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.interests.backA11y')}
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.backBtn,
              { borderColor: palette.borderStrong, backgroundColor: palette.panel },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.interests.backA11y')}
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
              accessibilityLabel={t('profile.interests.backA11y')}
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
            {t('profile.interests.description')}
          </Text>
          <Text style={[styles.selectedSummary, { color: palette.textMuted }]}>
            {t('profile.interests.selectedCount', { count: selectedCount })}
          </Text>

          {selectedCount === 0 ? (
            <Text style={[styles.emptyHint, { color: palette.textSecondary }]}>
              {t('profile.interests.empty')}
            </Text>
          ) : null}

          <View style={styles.categories}>
            {categoryIds.map((categoryId) => {
              const category = getOnboardingCategory(categoryId);
              const hierarchical = isHierarchicalInterestCategory(category);
              const activeGroupId = hierarchical
                ? resolveActiveGroupId(
                    category,
                    activeInterestGroupByCategory[categoryId],
                  )
                : undefined;

              return (
                <View key={categoryId} style={styles.categorySection}>
                  <OnboardingInterestCategoryPanel
                    categoryId={categoryId}
                    selected={selected}
                    onChangeSelected={setSelected}
                    activeGroupId={activeGroupId}
                    onActiveGroupChange={(groupId) => {
                      setActiveInterestGroupByCategory((prev) => ({
                        ...prev,
                        [categoryId]: groupId,
                      }));
                    }}
                    customRemoveAccessibilityLabel={(name) =>
                      t('profile.interests.customRemoveA11y', { name })
                    }
                  />
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
            accessibilityLabel={t('profile.interests.saveA11y')}
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
              <>
                <Ionicons name="save-outline" size={18} color={palette.surface} />
                <Text style={[styles.saveText, { color: palette.surface }]}>
                  {t('profile.interests.save')}
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
    gap: spacing.xl,
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
