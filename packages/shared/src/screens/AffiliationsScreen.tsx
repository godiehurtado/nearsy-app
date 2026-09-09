/**
 * Own Profile Affiliations editor — Nearsy 2.0 CRJ search/select panel.
 * Multi-category layout sets scrollAnchorYRef so search focus does not jump to y=0
 * (known iOS Own Profile Affiliations search bug — do not reproduce).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import TopHeader from '../components/TopHeader';
import { OnboardingAffiliationCategoryPanel } from '../components/registration/OnboardingAffiliationCategoryPanel';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  listOnboardingAffiliationCategoryIds,
  ONBOARDING_AFFILIATION_CATEGORIES,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from '../affiliations/onboardingAffiliationCatalog';
import {
  isPostCrjAffiliationEditorDirty,
  parsePostCrjAffiliationEditorParams,
  readAffiliationsForPostCrjEditor,
} from '../affiliations/postCrjAffiliationEditor';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence';
import {
  IDLE_AFFILIATION_SEARCH_UI,
  resolvePendingAffiliationSearchUi,
  type AffiliationSearchUiSnapshot,
} from '../affiliations/affiliationSearchInteraction';
import { describeAffiliationLogoRuntime } from '../affiliations/affiliationLogoDevConfig';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';

type ProfileMode = 'personal' | 'professional';

const CATEGORY_ORDER = listOnboardingAffiliationCategoryIds();

export default function AffiliationsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ProfileMode>('personal');
  const [uid, setUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingSelectedAffiliation[]>([]);
  const [snapshot, setSnapshot] = useState<OnboardingSelectedAffiliation[]>([]);
  const [expandedId, setExpandedId] = useState<OnboardingAffiliationCategoryId | null>(
    null,
  );
  const [searchUiByCategory, setSearchUiByCategory] = useState<
    Partial<Record<OnboardingAffiliationCategoryId, AffiliationSearchUiSnapshot>>
  >({});

  const scrollRef = useRef<ScrollView>(null);
  const categoryAnchorY = useRef<Partial<Record<OnboardingAffiliationCategoryId, number>>>(
    {},
  );
  const activeScrollAnchorYRef = useRef(0);
  const searchAddRef = useRef<(() => void) | null>(null);

  const pendingSearch = useMemo(
    () => resolvePendingAffiliationSearchUi(searchUiByCategory, CATEGORY_ORDER),
    [searchUiByCategory],
  );

  const dirty = isPostCrjAffiliationEditorDirty(snapshot, draft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const authUid = firebaseAuth.currentUser?.uid ?? null;
      const parsed = parsePostCrjAffiliationEditorParams(
        route.params ?? {},
        authUid,
      );
      if (!parsed.ok) {
        Alert.alert('Sign in required', 'Please sign in to edit affiliations.');
        navigation.goBack();
        return;
      }

      const { uid: targetUid, mode: targetMode } = parsed.params;
      setUid(targetUid);
      setMode(targetMode);

      const snap = await firestoreDb.collection('users').doc(targetUid).get();
      const exists =
        typeof snap.exists === 'function' ? snap.exists() : snap.exists;
      const data = (exists ? snap.data() : {}) as Record<string, unknown>;
      const { affiliations } = readAffiliationsForPostCrjEditor(data, targetMode);
      setDraft(affiliations);
      setSnapshot(affiliations);

      if (__DEV__) {
        const logo = describeAffiliationLogoRuntime();
        console.log('[AffiliationsScreen] logo runtime', {
          keyPresent: logo.keyPresent,
          envKeyPresent: logo.envKeyPresent,
          extraKeyPresent: logo.extraKeyPresent,
          host: logo.host,
        });
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load affiliations.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!expandedId) {
      activeScrollAnchorYRef.current = 0;
      return;
    }
    activeScrollAnchorYRef.current = categoryAnchorY.current[expandedId] ?? 0;
  }, [expandedId]);

  const onSearchUiChange = useCallback(
    (categoryId: OnboardingAffiliationCategoryId) =>
      (ui: AffiliationSearchUiSnapshot) => {
        setSearchUiByCategory((prev) => {
          const prevUi = prev[categoryId] ?? IDLE_AFFILIATION_SEARCH_UI;
          if (
            prevUi.phase === ui.phase &&
            prevUi.hideJourneyFooter === ui.hideJourneyFooter &&
            prevUi.showAddCta === ui.showAddCta &&
            prevUi.addName === ui.addName
          ) {
            return prev;
          }
          return { ...prev, [categoryId]: ui };
        });
      },
    [],
  );

  const save = async () => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      const patch = buildPostCrjAffiliationPersistencePatch(mode, draft);
      await firestoreDb
        .collection('users')
        .doc(uid)
        .set({ ...patch, updatedAt: Date.now() }, { merge: true });
      setSnapshot(draft);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save affiliations.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: palette.background }]}>
        <TopHeader
          topBarMode="color"
          topBarColor={palette.primary}
          leftIcon="chevron-back"
          onLeftPress={() => navigation.goBack()}
          showAvatar={false}
        />
        <View style={styles.centered}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: palette.background }]}>
      <TopHeader
        topBarMode="color"
        topBarColor={palette.primary}
        leftIcon="chevron-back"
        onLeftPress={() => navigation.goBack()}
        showAvatar={false}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 100 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={[styles.eyebrow, { color: palette.chipText }]}>
            {mode === 'professional' ? 'Professional' : 'Personal'}
          </Text>
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {t('onboarding.profileCompletion.affiliations.title' as any, {
              defaultValue: 'Your affiliations',
            })}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            {t('onboarding.profileCompletion.affiliations.body' as any, {
              defaultValue:
                'Search and add schools, teams, companies, and groups you belong to.',
            })}
          </Text>

          {ONBOARDING_AFFILIATION_CATEGORIES.map((category) => {
            const open = expandedId === category.id;
            const count = draft.filter((a) => a.categoryId === category.id)
              .length;
            return (
              <View
                key={category.id}
                style={[
                  styles.categoryCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                onLayout={(e) => {
                  categoryAnchorY.current[category.id] = e.nativeEvent.layout.y;
                  if (expandedId === category.id) {
                    activeScrollAnchorYRef.current = e.nativeEvent.layout.y;
                  }
                }}
              >
                <Pressable
                  onPress={() =>
                    setExpandedId((prev) =>
                      prev === category.id ? null : category.id,
                    )
                  }
                  style={styles.categoryHeader}
                  accessibilityRole="button"
                >
                  <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                  <View style={styles.categoryHeaderText}>
                    <Text
                      style={[styles.categoryTitle, { color: palette.textPrimary }]}
                    >
                      {t(
                        `onboarding.profileCompletion.affiliations.categories.${category.nameKey}` as any,
                        { defaultValue: category.name },
                      )}
                    </Text>
                    <Text
                      style={[
                        styles.categorySubtitle,
                        { color: palette.textSecondary },
                      ]}
                    >
                      {count > 0
                        ? `${count} added`
                        : t(
                            `onboarding.profileCompletion.affiliations.subtitles.${category.subtitleKey}` as any,
                            { defaultValue: category.subtitle },
                          )}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={palette.textSecondary}
                  />
                </Pressable>

                {open ? (
                  <View style={styles.panelWrap}>
                    <OnboardingAffiliationCategoryPanel
                      categoryId={category.id}
                      selected={draft}
                      onChangeSelected={setDraft}
                      onSearchUiChange={onSearchUiChange(category.id)}
                      searchAddRef={
                        pendingSearch?.categoryId === category.id
                          ? searchAddRef
                          : undefined
                      }
                      contentScrollRef={scrollRef}
                      scrollAnchorYRef={activeScrollAnchorYRef}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: palette.background,
              borderTopColor: palette.border,
            },
          ]}
        >
          {pendingSearch?.ui.showAddCta && pendingSearch.ui.addName ? (
            <Pressable
              style={[styles.addBtn, { backgroundColor: palette.primary }]}
              onPress={() => searchAddRef.current?.()}
            >
              <Text style={styles.addBtnText}>
                {t('onboarding.profileCompletion.affiliations.addNamed' as any, {
                  name: pendingSearch.ui.addName,
                  defaultValue: `Add ${pendingSearch.ui.addName}`,
                })}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.saveBtn,
                {
                  backgroundColor: dirty ? palette.primary : palette.chipBg,
                  opacity: saving ? 0.7 : 1,
                },
              ]}
              disabled={!dirty || saving}
              onPress={() => {
                void save();
              }}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: dirty ? '#fff' : palette.chipText },
                  ]}
                >
                  Save affiliations
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  categoryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  categoryEmoji: { fontSize: 22 },
  categoryHeaderText: { flex: 1 },
  categoryTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  categorySubtitle: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  panelWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  addBtn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  saveBtn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
});
