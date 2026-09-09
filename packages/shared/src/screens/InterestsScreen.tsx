/**
 * Own Profile Interests editor — Nearsy 2.0 onboarding catalog + post-CRJ persistence.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { OwnProfileEditorShell } from '../components/registration/OwnProfileEditorShell';
import { OnboardingInterestCategoryPanel } from '../components/registration/OnboardingInterestCategoryPanel';
import { PrimaryButton } from '../components/PrimaryButton';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  countFinalOnboardingInterests,
  buildPostCrjInterestPersistencePatch,
  ONBOARDING_INTEREST_CATEGORIES,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import {
  parsePostCrjInterestEditorParams,
  readOnboardingInterestsFromDoc,
} from '../interests/postCrjInterestEditor';
import {
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from '../interests/interestHierarchy';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';

type ProfileMode = 'personal' | 'professional';

function interestsFingerprint(selected: OnboardingSelectedInterest[]): string {
  const patch = buildPostCrjInterestPersistencePatch('personal', selected);
  return JSON.stringify(patch.personalOnboardingInterests ?? []);
}

function categoryAccent(category: (typeof ONBOARDING_INTEREST_CATEGORIES)[number]) {
  return (
    category.items?.[0]?.iconColor ??
    category.groups?.[0]?.iconColor ??
    '#2563EB'
  );
}

export default function InterestsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<ProfileMode>('personal');
  const [uid, setUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingSelectedInterest[]>([]);
  const [snapshot, setSnapshot] = useState<OnboardingSelectedInterest[]>([]);
  const [expandedId, setExpandedId] =
    useState<OnboardingInterestCategoryId | null>(null);
  const [activeGroupByCategory, setActiveGroupByCategory] = useState<
    Partial<Record<OnboardingInterestCategoryId, string>>
  >({});

  const dirty = interestsFingerprint(draft) !== interestsFingerprint(snapshot);
  const total = countFinalOnboardingInterests(draft);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const authUid = firebaseAuth.currentUser?.uid ?? null;
      const parsed = parsePostCrjInterestEditorParams(
        route.params ?? {},
        authUid,
      );
      if (!parsed.ok) {
        Alert.alert('Sign in required', 'Please sign in to edit interests.');
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
      const interests = readOnboardingInterestsFromDoc(data, targetMode);
      setDraft(interests);
      setSnapshot(interests);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not load interests.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, route.params]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!uid || saving) return;
    setSaving(true);
    try {
      const patch = buildPostCrjInterestPersistencePatch(mode, draft);
      await firestoreDb
        .collection('users')
        .doc(uid)
        .set({ ...patch, updatedAt: Date.now() }, { merge: true });
      setSnapshot(draft);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save interests.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <OwnProfileEditorShell
        title="Interests"
        onBack={() => navigation.goBack()}
        scroll={false}
      >
        <View style={styles.centered}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </OwnProfileEditorShell>
    );
  }

  return (
    <OwnProfileEditorShell
      title={t('onboarding.profileCompletion.interests.title' as any, {
        defaultValue: 'Your interests',
      })}
      eyebrow={mode === 'professional' ? 'Professional' : 'Personal'}
      body={
        total === 0
          ? t('onboarding.profileCompletion.interests.body' as any, {
              defaultValue: 'Choose what you care about.',
            })
          : `${total} selected`
      }
      onBack={() => navigation.goBack()}
      footer={
        <PrimaryButton
          label="Save interests"
          onPress={() => {
            void save();
          }}
          disabled={!dirty || saving}
          loading={saving}
        />
      }
    >
      {ONBOARDING_INTEREST_CATEGORIES.map((category) => {
        const open = expandedId === category.id;
        const count = draft.filter((i) => i.categoryId === category.id).length;
        const hierarchical = isHierarchicalInterestCategory(category);
        const accent = categoryAccent(category);
        const headerIcon =
          category.items?.[0]?.icon ??
          category.groups?.[0]?.icon ??
          'sparkles-outline';
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
              <View
                style={[
                  styles.categoryIconWrap,
                  { backgroundColor: `${accent}22` },
                ]}
              >
                <Ionicons name={headerIcon as any} size={18} color={accent} />
              </View>
              <View style={styles.categoryHeaderText}>
                <Text
                  style={[styles.categoryTitle, { color: palette.textPrimary }]}
                >
                  {t(
                    `onboarding.profileCompletion.interests.categories.${category.nameKey}` as any,
                    { defaultValue: category.name },
                  )}
                </Text>
                <Text
                  style={[
                    styles.categorySubtitle,
                    { color: palette.textSecondary },
                  ]}
                >
                  {count > 0 ? `${count} selected` : 'Tap to edit'}
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
                <OnboardingInterestCategoryPanel
                  categoryId={category.id}
                  selected={draft}
                  onChangeSelected={setDraft}
                  activeGroupId={
                    hierarchical
                      ? resolveActiveGroupId(
                          category,
                          activeGroupByCategory[category.id],
                        )
                      : undefined
                  }
                  onActiveGroupChange={
                    hierarchical
                      ? (groupId) => {
                          setActiveGroupByCategory((prev) => ({
                            ...prev,
                            [category.id]: groupId,
                          }));
                        }
                      : undefined
                  }
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
  categoryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
