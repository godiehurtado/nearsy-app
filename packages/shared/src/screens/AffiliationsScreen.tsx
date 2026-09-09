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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { OwnProfileEditorShell } from '../components/registration/OwnProfileEditorShell';
import { OnboardingAffiliationCategoryPanel } from '../components/registration/OnboardingAffiliationCategoryPanel';
import { PrimaryButton } from '../components/PrimaryButton';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  ONBOARDING_AFFILIATION_CATEGORIES,
  listOnboardingAffiliationCategoryIds,
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
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ProfileMode>('personal');
  const [uid, setUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingSelectedAffiliation[]>([]);
  const [snapshot, setSnapshot] = useState<OnboardingSelectedAffiliation[]>([]);
  const [expandedId, setExpandedId] =
    useState<OnboardingAffiliationCategoryId | null>(null);
  const [searchUiByCategory, setSearchUiByCategory] = useState<
    Partial<Record<OnboardingAffiliationCategoryId, AffiliationSearchUiSnapshot>>
  >({});

  const scrollRef = useRef<ScrollView>(null);
  const categoryAnchorY = useRef<
    Partial<Record<OnboardingAffiliationCategoryId, number>>
  >({});
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
      <OwnProfileEditorShell
        title="Affiliations"
        onBack={() => navigation.goBack()}
        scroll={false}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </OwnProfileEditorShell>
    );
  }

  const footer =
    pendingSearch?.ui.showAddCta && pendingSearch.ui.addName ? (
      <PrimaryButton
        label={t('onboarding.profileCompletion.affiliations.addNamed' as any, {
          name: pendingSearch.ui.addName,
          defaultValue: `Add ${pendingSearch.ui.addName}`,
        })}
        onPress={() => searchAddRef.current?.()}
      />
    ) : (
      <PrimaryButton
        label="Save affiliations"
        onPress={() => {
          void save();
        }}
        disabled={!dirty || saving}
        loading={saving}
      />
    );

  return (
    <OwnProfileEditorShell
      title={t('onboarding.profileCompletion.affiliations.title' as any, {
        defaultValue: 'Your affiliations',
      })}
      eyebrow={mode === 'professional' ? 'Professional' : 'Personal'}
      body={t('onboarding.profileCompletion.affiliations.body' as any, {
        defaultValue:
          'Search and add schools, teams, companies, and groups you belong to.',
      })}
      onBack={() => navigation.goBack()}
      footer={footer}
      contentScrollRef={scrollRef}
    >
      {ONBOARDING_AFFILIATION_CATEGORIES.map((category) => {
        const open = expandedId === category.id;
        const count = draft.filter((a) => a.categoryId === category.id).length;
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
    </OwnProfileEditorShell>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
});
