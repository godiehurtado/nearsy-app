// MainHomeScreen — Visibility & Discovery entry (Nearsy 2.0 MVP)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  setContactsSyncEnabled,
} from '../services/contactsSync';
import { doc, onSnapshot } from 'firebase/firestore';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme';
import {
  activateVisibilityFlow,
  deactivateVisibilityFlow,
  reconcileVisibilityWithForegroundPermission,
} from '../visibility/orchestration';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  parseSearchPreferencesFromUserDoc,
  presentDistanceFromCanonical,
  canonicalFromDisplayDistance,
  resolveCanonicalAfterDisplayClose,
  resolveDistanceDisplayUnit,
  selectPreferencesForMode,
  type VisibilitySearchPreferences,
  type VisibilitySearchPreferencesByMode,
  type DistanceDisplayUnit,
  MIN_DISTANCE_FEET,
  MAX_DISTANCE_FEET,
  MIN_DISTANCE_METERS_UI,
  MAX_DISTANCE_METERS_UI,
  DISTANCE_STEP_FEET,
  DISTANCE_STEP_METERS,
  isVisibilityDiscoveryClientError,
} from '../visibility';
import { persistSearchPreferencesForMode } from '../visibility/searchPreferencesStore';
import {
  resolveActiveMode,
  type ProfileMode,
} from '../profile/profileModeFields';
import { flattenCatalogInterestItems } from '../interests/onboardingInterestCatalog';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';

type ProfileDoc = {
  profileImage?: string | null;
  realName?: string;
  topBarColor?: string;
  visibility?: boolean;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';
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

function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  color,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  color: string;
}) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => onChange(Math.max(min, value - step))}
        style={[styles.stepBtn, { borderColor: color }]}
      >
        <Text style={{ color, fontWeight: '700' }}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepValue}>{value}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => onChange(Math.min(max, value + step))}
        style={[styles.stepBtn, { borderColor: color }]}
      >
        <Text style={{ color, fontWeight: '700' }}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MainHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const unit = useMemo(() => localeUnit(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [prefs, setPrefs] = useState<VisibilitySearchPreferencesByMode>(() =>
    parseSearchPreferencesFromUserDoc(null, unit),
  );
  const [savingPrefs, setSavingPrefs] = useState(false);

  const mode: ProfileMode = resolveActiveMode(profile) ?? 'personal';
  const activePrefs = selectPreferencesForMode(prefs, mode);

  const firstName = useMemo(() => {
    const rn = (profile.realName || '').trim();
    if (!rn) return 'Unnamed';
    const [first] = rn.split(/\s+/);
    return first || 'Unnamed';
  }, [profile.realName]);

  const displayDistance = presentDistanceFromCanonical(
    activePrefs.maxDistanceMeters,
    unit,
  );

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
            ),
          );
        }
        setLoading(false);
      },
      () => {
        Alert.alert(t('home.visibility.inactive'), t('nearby.emptyWithLocation'));
        setLoading(false);
      },
    );

    return () => unsub();
  }, [t, unit]);

  useEffect(() => {
    (async () => {
      const asked = await AsyncStorage.getItem(CONTACTS_ASKED_KEY);
      if (asked === '1') return;
      await AsyncStorage.setItem(CONTACTS_ASKED_KEY, '1');
      await setContactsSyncEnabled(false);
    })();
  }, []);

  // Reconcile permission vs remote visibility; start/stop BG tracking
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

  const savePrefs = async (next: VisibilitySearchPreferences) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid || savingPrefs) return;
    setSavingPrefs(true);
    try {
      const updated = await persistSearchPreferencesForMode(
        uid,
        prefs,
        mode,
        next,
      );
      setPrefs(updated);
    } catch {
      Alert.alert('Error', 'Could not save preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleActive = async () => {
    if (statusUpdating) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    const goingActive = !profile.visibility;
    setStatusUpdating(true);
    try {
      const client = await getVisibilityDiscoveryClient();
      if (goingActive) {
        const outcome = await activateVisibilityFlow(client);
        if (outcome.ok === false) {
          if (outcome.kind === 'permission-denied') {
            Alert.alert(
              t('home.visibility.inactive'),
              t('nearby.hintWithoutLocation'),
            );
          } else if (outcome.kind === 'invalid-accuracy') {
            Alert.alert(
              t('home.visibility.inactive'),
              'Location accuracy is too low. Move outdoors and try again.',
            );
          } else if (outcome.error?.retryable) {
            Alert.alert('Retry', 'Activation failed. Please try again.');
          } else {
            Alert.alert('Error', 'Could not activate Visibility.');
          }
          return;
        }
        setProfile((p) => ({ ...p, visibility: true }));
        await startBackgroundLocation({ uid }).catch(() => {});
      } else {
        const outcome = await deactivateVisibilityFlow(client);
        if (outcome.ok === false) {
          if (outcome.error?.retryable) {
            Alert.alert('Retry', 'Deactivation failed. Please try again.');
          } else {
            Alert.alert('Error', 'Could not deactivate Visibility.');
          }
          return;
        }
        setProfile((p) => ({ ...p, visibility: false }));
        await stopBackgroundLocation().catch(() => {});
      }
    } catch (err) {
      if (isVisibilityDiscoveryClientError(err) && err.retryable) {
        Alert.alert('Retry', 'Please try again.');
      } else {
        Alert.alert('Error', 'Could not update Visibility.');
      }
    } finally {
      setStatusUpdating(false);
    }
  };

  const interestCatalog = useMemo(() => flattenCatalogInterestItems(), []);
  const selectedIds = new Set(activePrefs.interestIds);

  const toggleInterest = (id: string) => {
    const nextIds = selectedIds.has(id)
      ? activePrefs.interestIds.filter((x) => x !== id)
      : [...activePrefs.interestIds, id];
    void savePrefs({ ...activePrefs, interestIds: nextIds });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  const topColor = profile.topBarColor || palette.primary;
  const canSearch = !!profile.visibility;
  const distMin = unit === 'ft' ? MIN_DISTANCE_FEET : MIN_DISTANCE_METERS_UI;
  const distMax = unit === 'ft' ? MAX_DISTANCE_FEET : MAX_DISTANCE_METERS_UI;
  const distStep = unit === 'ft' ? DISTANCE_STEP_FEET : DISTANCE_STEP_METERS;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      <TopHeader
        topBarMode={
          profile.topBarMode ?? (profile.topBarImage ? 'image' : 'color')
        }
        topBarColor={topColor}
        topBarImage={profile.topBarImage ?? null}
        profileImage={profile.profileImage ?? null}
        showAvatar
      />

      <View style={styles.container}>
        <Text style={[styles.name, { color: palette.textPrimary }]}>
          {t('home.greeting', { name: firstName })}
        </Text>
        <Text style={[styles.subtle, { color: palette.textMuted }]}>
          {profile.visibility
            ? t('home.visibility.activeHint')
            : t('home.visibility.inactiveHint')}
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={
            profile.visibility
              ? t('home.visibility.active')
              : t('home.visibility.inactive')
          }
          activeOpacity={0.8}
          onPress={handleToggleActive}
          disabled={statusUpdating}
          style={[
            styles.activePill,
            profile.visibility ? styles.activeOn : styles.activeOff,
            statusUpdating && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[
              styles.activeText,
              { color: profile.visibility ? '#0F5132' : '#6B7280' },
            ]}
          >
            {statusUpdating
              ? '…'
              : profile.visibility
                ? t('home.visibility.active')
                : t('home.visibility.inactive')}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          {mode === 'personal' ? 'Personal' : 'Professional'} preferences
        </Text>

        <Text style={[styles.prefLabel, { color: palette.textMuted }]}>
          Age {activePrefs.ageMin}–{activePrefs.ageMax}
        </Text>
        <View style={styles.row}>
          <Text style={{ color: palette.textPrimary }}>Min</Text>
          <Stepper
            value={activePrefs.ageMin}
            min={18}
            max={activePrefs.ageMax}
            step={1}
            onChange={(ageMin) => void savePrefs({ ...activePrefs, ageMin })}
            color={palette.primary}
          />
        </View>
        <View style={styles.row}>
          <Text style={{ color: palette.textPrimary }}>Max</Text>
          <Stepper
            value={activePrefs.ageMax}
            min={activePrefs.ageMin}
            max={99}
            step={1}
            onChange={(ageMax) => void savePrefs({ ...activePrefs, ageMax })}
            color={palette.primary}
          />
        </View>

        <Text style={[styles.prefLabel, { color: palette.textMuted }]}>
          Distance {displayDistance} {unit}
        </Text>
        <Stepper
          value={displayDistance}
          min={distMin}
          max={distMax}
          step={distStep}
          onChange={(v) => {
            const canonical = resolveCanonicalAfterDisplayClose(
              activePrefs.maxDistanceMeters,
              v,
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
          color={palette.primary}
        />

        <Text style={[styles.prefLabel, { color: palette.textMuted }]}>
          Interests (empty = anyone)
        </Text>
        <View style={styles.chips}>
          {interestCatalog.slice(0, 24).map((item) => {
            const on = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => toggleInterest(item.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? palette.primary : palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: on ? '#fff' : palette.textPrimary,
                    fontSize: 12,
                  }}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
          {t('home.discovery.title')}
        </Text>
        <Text style={[styles.paragraph, { color: palette.textMuted }]}>
          {t('home.discovery.cta')}
        </Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('home.discovery.title')}
          activeOpacity={canSearch ? 0.85 : 1}
          disabled={!canSearch}
          onPress={() => navigation.navigate('NearbySearch')}
          style={[
            styles.searchBtn,
            { backgroundColor: canSearch ? palette.primary : '#9CA3AF' },
            !canSearch && { opacity: 0.6 },
          ]}
        >
          <View style={styles.searchIconWrap}>
            <Image
              source={require('../assets/search_icon.png')}
              style={{ width: 70, height: 70, resizeMode: 'contain' }}
            />
          </View>
          <Text style={styles.searchText}>{t('home.discovery.title')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'center',
  },
  name: { fontSize: 26, fontWeight: '800' },
  subtle: { marginTop: 4, textAlign: 'center' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginTop: 10,
  },
  activeOn: {
    backgroundColor: '#DBEAFF',
    borderWidth: 1,
    borderColor: '#A8BDDA',
  },
  activeOff: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activeText: { fontWeight: '700', letterSpacing: 0.5 },
  sectionTitle: {
    marginTop: 28,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  paragraph: { marginTop: 6, textAlign: 'center' },
  prefLabel: { marginTop: 12, alignSelf: 'flex-start', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 48,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
  searchBtn: {
    marginTop: 14,
    width: '86%',
    alignSelf: 'center',
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  searchIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
});
