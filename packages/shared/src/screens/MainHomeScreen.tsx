// MainHomeScreen — Visibility & Discovery (final UI)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Pressable,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, onSnapshot } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { setContactsSyncEnabled } from '../services/contactsSync';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';
import { cardShadow } from '../theme/shadows';
import {
  activateVisibilityFlow,
  deactivateVisibilityFlow,
  reconcileVisibilityWithForegroundPermission,
} from '../visibility/orchestration';
import { pressTransformStyle } from '../visibility/pressTransformStyle';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  parseSearchPreferencesFromUserDoc,
  presentDistanceFromCanonical,
  canonicalFromDisplayDistance,
  resolveCanonicalAfterDisplayClose,
  resolveDistanceDisplayUnit,
  selectPreferencesForMode,
  canAddSearchInterest,
  prepareSearchPreferencesForPersist,
  INTEREST_IDS_OVER_MAX_REASON,
  isVisibilityDiscoveryClientError,
  MAX_SEARCH_INTEREST_IDS,
  MIN_VISIBILITY_AGE,
  MAX_VISIBILITY_AGE,
  MIN_DISTANCE_FEET,
  MAX_DISTANCE_FEET,
  MIN_DISTANCE_METERS_UI,
  MAX_DISTANCE_METERS_UI,
  DISTANCE_STEP_FEET,
  DISTANCE_STEP_METERS,
  type VisibilitySearchPreferences,
  type VisibilitySearchPreferencesByMode,
  type DistanceDisplayUnit,
} from '../visibility';
import {
  officialCatalogInterestIdSet,
  persistSearchPreferencesForMode,
} from '../visibility/searchPreferencesStore';
import {
  resolveActiveMode,
  resolveActivePresentation,
  type ProfileMode,
} from '../profile/profileModeFields';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';
import {
  logVisibilityErrorDiagnostic,
  presentUnknownVisibilityError,
  presentVisibilityCallableError,
  presentVisibilityLocalError,
  type VisibilityErrorPresentation,
} from '../visibility/visibilityErrorPresentation';
import { VisibilityCard } from '../components/visibility/VisibilityCard';
import { VisibilityRangeSlider } from '../components/visibility/VisibilityRangeSlider';
import { InterestMatchSelector } from '../components/visibility/InterestMatchSelector';

type ProfileDoc = {
  profileImage?: string | null;
  realName?: string;
  visibility?: boolean;
  mode?: ProfileMode;
  searchPreferences?: unknown;
  profiles?: unknown;
};

type Props = NativeStackScreenProps<any>;

const CONTACTS_ASKED_KEY = 'NEARSY_CONTACTS_ASKED';

function localeUnit(): DistanceDisplayUnit {
  const tag = Localization.getLocales()?.[0]?.languageTag ?? 'en';
  return resolveDistanceDisplayUnit(tag);
}

function displayNameFromProfile(data: ProfileDoc, mode: ProfileMode): string {
  const presentation = resolveActivePresentation(data as Record<string, unknown>);
  const full = [presentation.realName, presentation.lastName]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' ');
  if (full) return full;
  const legacy = (data.realName || '').trim();
  if (legacy) return legacy;
  return mode === 'professional' ? 'Professional' : 'Personal';
}

function firstNameFromDisplayName(name: string): string {
  const [first] = name.split(/\s+/);
  return first || name;
}

export default function MainHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { palette, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const unit = useMemo(() => localeUnit(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [prefs, setPrefs] = useState<VisibilitySearchPreferencesByMode>(() =>
    parseSearchPreferencesFromUserDoc(null, unit),
  );
  const [interestLimitMessage, setInterestLimitMessage] = useState<
    string | null
  >(null);
  const [visibilityError, setVisibilityError] =
    useState<VisibilityErrorPresentation | null>(null);

  const officialInterestIds = useMemo(() => officialCatalogInterestIdSet(), []);
  const mode: ProfileMode = resolveActiveMode(profile) ?? 'personal';
  const activePrefs = selectPreferencesForMode(prefs, mode);
  const presentation = resolveActivePresentation(
    profile as Record<string, unknown>,
  );
  const displayName = displayNameFromProfile(profile, mode);
  const firstName = firstNameFromDisplayName(displayName);
  const profileImage =
    presentation.profileImage ?? profile.profileImage ?? null;

  const displayDistance = presentDistanceFromCanonical(
    activePrefs.maxDistanceMeters,
    unit,
  );

  const distMin = unit === 'ft' ? MIN_DISTANCE_FEET : MIN_DISTANCE_METERS_UI;
  const distMax = unit === 'ft' ? MAX_DISTANCE_FEET : MAX_DISTANCE_METERS_UI;
  const distStep = unit === 'ft' ? DISTANCE_STEP_FEET : DISTANCE_STEP_METERS;

  const pillColors = profile.visibility
    ? theme === 'dark'
      ? {
          bg: '#17305C',
          border: '#2E5CC0',
          text: '#3FB27F',
          check: '#2E5CC0',
        }
      : {
          bg: '#EDF3FF',
          border: '#CBDCF7',
          text: '#2E9E6C',
          check: '#4E77C7',
        }
    : theme === 'dark'
      ? {
          bg: '#132349',
          border: '#28407A',
          text: '#7EA0D6',
          check: '#7285AC',
        }
      : {
          bg: '#F5F7FA',
          border: '#E9ECF3',
          text: '#8492AD',
          check: '#C2CADC',
        };

  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const ref = doc(firestoreDb, 'users', uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = (snap.data() as ProfileDoc) ?? {};
          setProfile(data);
          setPrefs(
            parseSearchPreferencesFromUserDoc(
              data as Record<string, unknown>,
              unit,
              officialInterestIds,
            ),
          );
        }
        setLoading(false);
      },
      () => {
        setVisibilityError(presentUnknownVisibilityError(t));
        setLoading(false);
      },
    );

    return () => unsub();
  }, [t, unit, officialInterestIds]);

  useEffect(() => {
    (async () => {
      const asked = await AsyncStorage.getItem(CONTACTS_ASKED_KEY);
      if (asked === '1') return;
      await AsyncStorage.setItem(CONTACTS_ASKED_KEY, '1');
      await setContactsSyncEnabled(false);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid || loading) return;
        try {
          const client = await getVisibilityDiscoveryClient();
          const remote = !!profile.visibility;
          const result = await reconcileVisibilityWithForegroundPermission(
            remote,
            client,
          );
          if (cancelled) return;
          if (result.reconciled) {
            setProfile((p) => ({ ...p, visibility: false }));
            await stopBackgroundLocation().catch(() => {});
            return;
          }
          if (result.visibility) {
            await startBackgroundLocation({ uid }).catch(() => {});
          } else {
            await stopBackgroundLocation().catch(() => {});
          }
        } catch {
          // best-effort
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [profile.visibility, loading]),
  );

  const showVisibilityError = (
    presentation: VisibilityErrorPresentation,
    err?: unknown,
  ) => {
    setVisibilityError(presentation);
    logVisibilityErrorDiagnostic('MainHome.visibility', presentation, err);
    Alert.alert(presentation.title, presentation.userMessage);
  };

  const announceInterestLimit = () => {
    const title = t('home.discovery.maxInterestsTitle');
    const message = t('home.discovery.maxInterests');
    setInterestLimitMessage(message);
    AccessibilityInfo.announceForAccessibility(message);
    Alert.alert(title, message);
  };

  const savePrefs = async (next: VisibilitySearchPreferences) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    const prepared = prepareSearchPreferencesForPersist(
      next,
      officialInterestIds,
    );
    if (prepared.ok === false) {
      if (prepared.reasons.includes(INTEREST_IDS_OVER_MAX_REASON)) {
        announceInterestLimit();
      }
      return;
    }
    // Optimistic update so chips/counter appear before network round-trip.
    const optimistic = { ...prefs, [mode]: prepared.prefs };
    setPrefs(optimistic);
    setInterestLimitMessage(null);
    try {
      const updated = await persistSearchPreferencesForMode(
        uid,
        prefs,
        mode,
        prepared.prefs,
      );
      setPrefs(updated);
    } catch (err) {
      setPrefs(prefs);
      const text = err instanceof Error ? err.message : '';
      if (text.includes(INTEREST_IDS_OVER_MAX_REASON)) {
        announceInterestLimit();
      } else {
        Alert.alert(t('home.errors.title'), t('home.errors.generic'));
      }
    }
  };

  const handleToggleActive = async () => {
    if (statusUpdating) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    const goingActive = !profile.visibility;
    setStatusUpdating(true);
    setVisibilityError(null);
    try {
      const client = await getVisibilityDiscoveryClient();
      if (goingActive) {
        const outcome = await activateVisibilityFlow(client);
        if (outcome.ok === false) {
          if (outcome.kind === 'permission-denied') {
            showVisibilityError(
              presentVisibilityLocalError('permission-denied', t),
            );
          } else if (outcome.kind === 'invalid-accuracy') {
            showVisibilityError(
              presentVisibilityLocalError('invalid-accuracy', t),
            );
          } else if (outcome.kind === 'unavailable') {
            showVisibilityError(
              presentVisibilityLocalError('unavailable', t),
            );
          } else if (outcome.error) {
            showVisibilityError(
              presentVisibilityCallableError(outcome.error, t),
              outcome.error,
            );
          } else {
            showVisibilityError(presentUnknownVisibilityError(t));
          }
          return;
        }
        setProfile((p) => ({ ...p, visibility: true }));
        await startBackgroundLocation({ uid }).catch(() => {});
      } else {
        const outcome = await deactivateVisibilityFlow(client);
        if (outcome.ok === false) {
          showVisibilityError(
            presentVisibilityCallableError(outcome.error, t),
            outcome.error,
          );
          return;
        }
        setProfile((p) => ({ ...p, visibility: false }));
        await stopBackgroundLocation().catch(() => {});
      }
    } catch (err) {
      if (isVisibilityDiscoveryClientError(err)) {
        showVisibilityError(presentVisibilityCallableError(err, t), err);
      } else {
        showVisibilityError(presentUnknownVisibilityError(t), err);
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const atInterestLimit =
    activePrefs.interestIds.length >= MAX_SEARCH_INTEREST_IDS;

  const addInterest = (id: string) => {
    if (
      !canAddSearchInterest(activePrefs.interestIds, id, officialInterestIds)
    ) {
      announceInterestLimit();
      return;
    }
    void savePrefs({
      ...activePrefs,
      interestIds: [...activePrefs.interestIds, id],
    });
  };

  const removeInterest = (id: string) => {
    setInterestLimitMessage(null);
    void savePrefs({
      ...activePrefs,
      interestIds: activePrefs.interestIds.filter((x) => x !== id),
    });
  };

  if (loading) {
    return (
      <View
        style={[styles.centered, { backgroundColor: palette.background }]}
      >
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  const canSearch = !!profile.visibility;
  const modeLabel =
    mode === 'personal'
      ? t('home.modePersonal')
      : t('home.modeProfessional');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingBottom: 96 + insets.bottom,
      }}
      keyboardShouldPersistTaps="always"
    >
      <View style={[styles.brandRow, { paddingTop: insets.top + spacing.lg }]}>
        <View
          style={[styles.brandIcon, { borderColor: palette.primary }]}
        >
          <Ionicons name="location-outline" size={12} color={palette.primary} />
        </View>
        <Text style={[styles.brandWordmark, { color: palette.textPrimary }]}>
          {t('home.brand')}
        </Text>
      </View>

      <View style={styles.hero}>
        <View
          style={[
            styles.avatarRing,
            {
              borderColor: palette.chipBg,
              backgroundColor: palette.primary,
            },
            cardShadow,
          ]}
        >
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.avatar} />
          ) : (
            <Ionicons name="person" size={42} color="#FFFFFF" />
          )}
        </View>

        <Text style={[styles.displayName, { color: palette.textPrimary }]}>
          {displayName}
        </Text>
        <Text style={[styles.accountLead, { color: palette.textMuted }]}>
          {t('home.accountStatus')}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            profile.visibility
              ? t('home.visibility.active')
              : t('home.visibility.inactive')
          }
          disabled={statusUpdating}
          onPress={handleToggleActive}
          style={({ pressed }) => [
            styles.statusPill,
            {
              backgroundColor: pillColors.bg,
              borderColor: pillColors.border,
              opacity: statusUpdating ? 0.7 : 1,
              ...pressTransformStyle(pressed),
            },
          ]}
        >
          <View
            style={[styles.statusCheck, { backgroundColor: pillColors.check }]}
          >
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
          <Text style={[styles.statusLabel, { color: pillColors.text }]}>
            {statusUpdating
              ? '…'
              : profile.visibility
                ? t('home.visibility.active').toUpperCase()
                : t('home.visibility.inactive').toUpperCase()}
          </Text>
        </Pressable>

        <Text style={[styles.controlHint, { color: palette.textMuted }]}>
          {t('home.controlHint')}
        </Text>

        {visibilityError ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.errorBanner,
              {
                backgroundColor: palette.dangerBg,
                borderColor: palette.danger,
              },
            ]}
          >
            <Text style={[styles.errorTitle, { color: palette.danger }]}>
              {visibilityError.title}
            </Text>
            <Text style={[styles.errorBody, { color: palette.textPrimary }]}>
              {visibilityError.userMessage}
            </Text>
            {__DEV__ ? (
              <Text style={[styles.errorDev, { color: palette.textMuted }]}>
                {visibilityError.devDetail}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          {t('home.findPeopleTitle')}
        </Text>
        <Text style={[styles.sectionBody, { color: palette.textSecondary }]}>
          {t('home.findPeopleBody')}
        </Text>
        <Text style={[styles.modeLabel, { color: palette.textMuted }]}>
          {t('home.modePreferences', { mode: modeLabel })}
        </Text>

        <VisibilityCard style={styles.prefsCard}>
          <View style={styles.prefHeader}>
            <Text style={[styles.prefEyebrow, { color: palette.textMuted }]}>
              {t('home.preferences.ageRange')}
            </Text>
            <Text style={[styles.prefValue, { color: palette.textPrimary }]}>
              {t('home.preferences.ageValue', {
                min: activePrefs.ageMin,
                max: activePrefs.ageMax,
              })}
            </Text>
          </View>
          <Text style={[styles.prefHint, { color: palette.textMuted }]}>
            {t('home.preferences.ageRangeHint')}
          </Text>
          <VisibilityRangeSlider
            mode="dual"
            min={MIN_VISIBILITY_AGE}
            max={MAX_VISIBILITY_AGE}
            step={1}
            low={activePrefs.ageMin}
            high={activePrefs.ageMax}
            accessibilityLabel={t('home.preferences.ageRange')}
            onChange={(ageMin, ageMax) => {
              void savePrefs({ ...activePrefs, ageMin, ageMax });
            }}
          />
          <View style={styles.sliderBounds}>
            <Text style={[styles.boundLabel, { color: palette.textMuted }]}>
              {MIN_VISIBILITY_AGE}
            </Text>
            <Text style={[styles.boundLabel, { color: palette.textMuted }]}>
              {MAX_VISIBILITY_AGE}
            </Text>
          </View>

          <View style={[styles.prefDivider, { borderTopColor: palette.border }]}>
            <View style={styles.prefHeader}>
              <Text style={[styles.prefEyebrow, { color: palette.textMuted }]}>
                {t('home.preferences.distanceRange')}
              </Text>
              <Text style={[styles.prefValue, { color: palette.textPrimary }]}>
                {unit === 'ft'
                  ? t('home.preferences.distanceValueFt', {
                      value: displayDistance,
                    })
                  : t('home.preferences.distanceValueM', {
                      value: displayDistance,
                    })}
              </Text>
            </View>
            <VisibilityRangeSlider
              mode="single"
              min={distMin}
              max={distMax}
              step={distStep}
              value={displayDistance}
              accessibilityLabel={t('home.preferences.distanceRange')}
              onChange={(nextDisplay) => {
                const canonical = resolveCanonicalAfterDisplayClose(
                  activePrefs.maxDistanceMeters,
                  nextDisplay,
                  unit,
                );
                void savePrefs({
                  ...activePrefs,
                  maxDistanceMeters: canonicalFromDisplayDistance(
                    presentDistanceFromCanonical(canonical, unit),
                    unit,
                  ),
                });
              }}
            />
            <View style={styles.sliderBounds}>
              <Text style={[styles.boundLabel, { color: palette.textMuted }]}>
                {distMin}
                {unit}
              </Text>
              <Text style={[styles.boundLabel, { color: palette.textMuted }]}>
                {distMax}
                {unit}
              </Text>
            </View>
          </View>

          <InterestMatchSelector
            officialIds={officialInterestIds}
            selectedIds={activePrefs.interestIds}
            atLimit={atInterestLimit}
            limitMessage={interestLimitMessage}
            onAdd={addInterest}
            onRemove={removeInterest}
            onLimitReached={announceInterestLimit}
          />
        </VisibilityCard>

        {canSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.discovery.title')}
            onPress={() => navigation.navigate('NearbySearch')}
            style={({ pressed }) => [
              styles.discoveryBtn,
              cardShadow,
              pressTransformStyle(pressed),
            ]}
          >
            <LinearGradient
              colors={['#5B84D0', palette.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.discoveryGradient}
            >
              <Ionicons name="people-outline" size={30} color="#FFFFFF" />
              <Text style={styles.discoveryLabel}>
                {t('home.discovery.title')}
              </Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <View style={styles.discoveryDisabledWrap}>
            <View
              style={[
                styles.discoveryDisabled,
                { borderColor: palette.textMuted },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={28}
                color={palette.textMuted}
              />
              <Text
                style={[styles.discoveryDisabledLabel, { color: palette.textMuted }]}
              >
                {t('home.discovery.title')}
              </Text>
            </View>
            <Text style={[styles.discoveryReason, { color: palette.textMuted }]}>
              {t('home.discovery.disabledReason')}
            </Text>
          </View>
        )}

        <Text style={[styles.greetingSubtle, { color: palette.textMuted }]}>
          {t('home.greeting', { name: firstName })}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: screenPadding.horizontal,
  },
  brandIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWordmark: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: screenPadding.horizontal + 2,
    marginTop: spacing.lg,
  },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  displayName: {
    marginTop: spacing.md,
    fontSize: 28,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  accountLead: {
    marginTop: spacing.sm,
    fontSize: fontSize.base,
  },
  statusPill: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  statusCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
  },
  controlHint: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    lineHeight: 19,
    textAlign: 'center',
  },
  errorBanner: {
    marginTop: spacing.lg,
    width: '100%',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  errorBody: {
    marginTop: spacing.xxs,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  errorDev: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
  content: {
    paddingHorizontal: screenPadding.horizontal + 2,
    paddingTop: spacing.xxl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  sectionBody: {
    marginTop: spacing.sm,
    fontSize: fontSize.base,
    lineHeight: 20,
    textAlign: 'center',
  },
  modeLabel: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  prefsCard: {
    marginTop: spacing.lg,
  },
  prefHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  prefEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  prefValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.extrabold,
  },
  prefHint: {
    marginTop: spacing.xxs,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  prefDivider: {
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sliderBounds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxs,
  },
  boundLabel: {
    fontSize: 10.5,
  },
  discoveryBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.lg + 4,
    overflow: 'hidden',
  },
  discoveryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg + 2,
  },
  discoveryLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.md + 1.5,
    fontWeight: fontWeight.extrabold,
  },
  discoveryDisabledWrap: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  discoveryDisabled: {
    width: '100%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg + 2,
  },
  discoveryDisabledLabel: {
    fontSize: fontSize.md + 1.5,
    fontWeight: fontWeight.extrabold,
  },
  discoveryReason: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  greetingSubtle: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: fontSize.sm,
  },
});
