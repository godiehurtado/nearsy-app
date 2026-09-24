// MainHomeScreen — Visibility & Discovery (final UI)
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Keyboard,
  AppState,
  Linking,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
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
  ensureForegroundPermission,
  reconcileVisibilityWithForegroundPermission,
} from '../visibility/orchestration';
import { evaluateVisibilitySettingsReturn, evaluateBackgroundLocationSettingsReturn } from '../visibility/settingsRecovery';
import {
  clearVisibilityRecoveryIntent,
  decideVisibilityRecoveryAction,
  readVisibilityRecoveryIntent,
} from '../visibility/visibilityRecoveryIntent';
import { pressTransformStyle } from '../visibility/pressTransformStyle';
import {
  reconcileUserDocWithActiveProfileMode,
} from '../visibility/activeProfileModeReconciliation';
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
  type VisibilitySearchPreferencesByMode,
  type DistanceDisplayUnit,
} from '../visibility';
import {
  officialCatalogInterestIdSet,
  persistSearchPreferencesForMode,
} from '../visibility/searchPreferencesStore';
import {
  applyModeFieldPatch,
  shouldApplyRemotePreferences,
  type PrefsFieldPatch,
} from '../visibility/preferenceDraft';
import {
  resolveActiveMode,
  resolveActivePresentation,
  type ProfileMode,
} from '../profile/profileModeFields';
import {
  startGatedBackgroundLocation,
  stopBackgroundLocation,
  getLocationPermissionSnapshot,
} from '../location/startGatedBackgroundLocation';
import { backgroundLocationNotificationCopy } from '../location/backgroundLocationCopy';
import {
  hasSeenBackgroundLocationEducation,
  markBackgroundLocationEducationSeen,
  resolveBackgroundDisclosureVariant,
  type BackgroundDisclosureVariant,
} from '../location/backgroundEducationStorage';
import { requiresSettingsForBackgroundPermission } from '../location/backgroundPublicationGate';
import {
  consumePostLoginLocationRecovery,
  markBackgroundDisclosureOfferedThisSession,
  wasBackgroundDisclosureOfferedThisSession,
} from '../location/locationJourneySession';
import {
  evaluateVisibilityHydration,
  isHomeSearchEnabled,
  resolvePermissionValidationOnVisibilitySnapshot,
  shouldResetPermissionValidationOnVisibilityChange,
} from '../location/visibilityHydration';
import { consumeCrjVisibilityProvisionalActive } from '../visibility/crjVisibilityProvisional';
import {
  isVisibilityToggleDisabled,
  shouldForceFullBackgroundEducation,
} from '../location/homeLocationRecovery';
import { BackgroundLocationDisclosureModal } from '../components/BackgroundLocationDisclosureModal';
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
import { MVP_FREE_SHOW_INTEREST_SEARCH_FILTER } from '../product/mvpFreePresentation';

type ProfileDoc = {
  profileImage?: string | null;
  realName?: string;
  visibility?: boolean;
  bgVisible?: boolean;
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

export default function MainHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { palette, theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const unit = useMemo(() => localeUnit(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [statusUpdating, setStatusUpdating] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const pendingVisibilityIntentRef = useRef(false);
  const statusUpdatingRef = useRef(statusUpdating);
  statusUpdatingRef.current = statusUpdating;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [prefs, setPrefs] = useState<VisibilitySearchPreferencesByMode>(() =>
    parseSearchPreferencesFromUserDoc(null, unit),
  );
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const inFlightWritesRef = useRef(0);
  const localEpochRef = useRef(0);
  const appliedEpochRef = useRef(0);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [ageVisual, setAgeVisual] = useState<{
    ageMin: number;
    ageMax: number;
  } | null>(null);
  const [distanceVisual, setDistanceVisual] = useState<number | null>(null);
  const [interestLimitMessage, setInterestLimitMessage] = useState<
    string | null
  >(null);
  const [visibilityError, setVisibilityError] =
    useState<VisibilityErrorPresentation | null>(null);
  const [bgDisclosureVisible, setBgDisclosureVisible] = useState(false);
  const [bgDisclosureVariant, setBgDisclosureVariant] =
    useState<BackgroundDisclosureVariant>('full');
  const [bgDisclosureBusy, setBgDisclosureBusy] = useState(false);
  // Consume CRJ activate-success one-shot once on mount so Home can paint
  // provisional Active while the first snapshot is still cached false.
  const crjProvisionalSeedRef = useRef<boolean | null>(null);
  if (crjProvisionalSeedRef.current === null) {
    const uid = firebaseAuth.currentUser?.uid;
    crjProvisionalSeedRef.current = uid
      ? consumeCrjVisibilityProvisionalActive(uid)
      : false;
  }
  const [crjProvisionalActive, setCrjProvisionalActive] = useState(
    () => crjProvisionalSeedRef.current === true,
  );
  const crjProvisionalActiveRef = useRef(crjProvisionalActive);
  crjProvisionalActiveRef.current = crjProvisionalActive;
  const [permissionValidationPending, setPermissionValidationPending] =
    useState(() => crjProvisionalSeedRef.current === true);
  const [permissionsValid, setPermissionsValid] = useState<
    boolean | undefined
  >(undefined);
  const previousVisibilityRef = useRef<boolean | undefined>(undefined);
  const pendingBgEnableFromSettingsRef = useRef(false);
  const postLoginRecoveryStartedRef = useRef(false);
  const educationOfferInFlightRef = useRef(false);

  const officialInterestIds = useMemo(() => officialCatalogInterestIdSet(), []);
  const mode: ProfileMode = resolveActiveMode(profile) ?? 'personal';

  const fgsCopy = useMemo(() => backgroundLocationNotificationCopy(t), [t]);

  const startGatedBackgroundIfAllowed = useCallback(
    async (uid: string) => {
      const visibility = !!profileRef.current.visibility;
      const bgVisible = !!profileRef.current.bgVisible;
      if (!visibility || !bgVisible) {
        await stopBackgroundLocation().catch(() => {});
        return;
      }
      await startGatedBackgroundLocation({
        uid,
        visibility: true,
        bgVisible: true,
        requestPermissions: false,
        ...fgsCopy,
      });
    },
    [fgsCopy],
  );

  /**
   * Offer background education without preparation overlay.
   * forceFull: reinstall — show even if OS BG already granted.
   */
  const offerBackgroundEducationIfNeeded = useCallback(
    async (opts?: { forceFull?: boolean }) => {
      if (Platform.OS === 'web') return;
      if (educationOfferInFlightRef.current || bgDisclosureVisible) return;
      if (
        !opts?.forceFull &&
        wasBackgroundDisclosureOfferedThisSession()
      ) {
        return;
      }

      educationOfferInFlightRef.current = true;
      try {
        const snap = await getLocationPermissionSnapshot();
        if (!opts?.forceFull && snap.backgroundGranted) {
          if (profileRef.current.bgVisible && profileRef.current.visibility) {
            const uid = firebaseAuth.currentUser?.uid;
            if (uid) await startGatedBackgroundIfAllowed(uid);
          }
          return;
        }

        const variant = opts?.forceFull
          ? 'full'
          : await resolveBackgroundDisclosureVariant();
        markBackgroundDisclosureOfferedThisSession();
        setBgDisclosureVariant(variant);
        setBgDisclosureVisible(true);
      } finally {
        educationOfferInFlightRef.current = false;
      }
    },
    [bgDisclosureVisible, startGatedBackgroundIfAllowed],
  );

  const completeBackgroundDisclosure = useCallback(
    async (enable: boolean) => {
      const uid = firebaseAuth.currentUser?.uid;
      setBgDisclosureBusy(true);
      try {
        await markBackgroundLocationEducationSeen().catch(() => {});
        if (!enable || !uid) {
          const { updateUserProfilePartial } = await import(
            '../services/firestoreService'
          );
          if (uid) {
            await updateUserProfilePartial(uid, {
              bgVisible: false,
              updatedAt: Date.now(),
            }).catch(() => {});
            setProfile((p) => ({ ...p, bgVisible: false }));
          }
          setBgDisclosureVisible(false);
          return;
        }

        const snap = await getLocationPermissionSnapshot();
        if (!snap.fineLocationGranted && snap.foregroundGranted) {
          Alert.alert(
            t('settings.backgroundVisibility.approximateTitle'),
            t('settings.backgroundVisibility.approximateMessage'),
            [
              { text: t('common.actions.cancel'), style: 'cancel' },
              {
                text: t('settings.backgroundVisibility.openSettings'),
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
          setBgDisclosureVisible(false);
          return;
        }

        if (requiresSettingsForBackgroundPermission(Platform.Version)) {
          pendingBgEnableFromSettingsRef.current = true;
          setBgDisclosureVisible(false);
          void Linking.openSettings();
          return;
        }

        const result = await startGatedBackgroundLocation({
          uid,
          visibility: !!profileRef.current.visibility,
          bgVisible: true,
          requestPermissions: true,
          ...fgsCopy,
        });

        if (result.ok === true) {
          const { updateUserProfilePartial } = await import(
            '../services/firestoreService'
          );
          await updateUserProfilePartial(uid, {
            bgVisible: true,
            updatedAt: Date.now(),
          });
          setProfile((p) => ({ ...p, bgVisible: true }));
        } else if (result.reason === 'needs-settings') {
          pendingBgEnableFromSettingsRef.current = true;
          void Linking.openSettings();
        } else if (
          result.reason === 'background-denied' ||
          result.reason === 'foreground-denied'
        ) {
          await stopBackgroundLocation().catch(() => {});
        }
      } finally {
        setBgDisclosureBusy(false);
        setBgDisclosureVisible(false);
      }
    },
    [fgsCopy, t],
  );

  const activePrefs = selectPreferencesForMode(prefs, mode);
  const presentation = resolveActivePresentation(
    profile as Record<string, unknown>,
  );
  const displayName = displayNameFromProfile(profile, mode);
  const profileImage =
    presentation.profileImage ?? profile.profileImage ?? null;

  const displayDistance =
    distanceVisual ??
    presentDistanceFromCanonical(activePrefs.maxDistanceMeters, unit);
  const displayAgeMin = ageVisual?.ageMin ?? activePrefs.ageMin;
  const displayAgeMax = ageVisual?.ageMax ?? activePrefs.ageMax;

  const distMin = unit === 'ft' ? MIN_DISTANCE_FEET : MIN_DISTANCE_METERS_UI;
  const distMax = unit === 'ft' ? MAX_DISTANCE_FEET : MAX_DISTANCE_METERS_UI;
  const distStep = unit === 'ft' ? DISTANCE_STEP_FEET : DISTANCE_STEP_METERS;

  const visibilityHydration = evaluateVisibilityHydration({
    profileLoaded: !loading,
    persistedVisibility: loading
      ? undefined
      : profile.visibility === undefined
        ? undefined
        : !!profile.visibility,
    permissionValidationPending,
    permissionsValid,
    crjActivationProvisional: crjProvisionalActive,
  });

  const pillColors = visibilityHydration.displayActive
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
    return () => {
      setBgDisclosureVisible(false);
      educationOfferInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = dbOnUserSnapshot(
      uid,
      (raw) => {
        if (raw) {
          const data = reconcileUserDocWithActiveProfileMode(
            (raw as ProfileDoc) ?? {},
            uid,
          );
          setProfile(data);
          // After any local edit, draft owns the truth until remount.
          // While writes are in flight, never rehydrate prefs from snapshots.
          if (
            inFlightWritesRef.current === 0 &&
            localEpochRef.current === 0
          ) {
            const remote = parseSearchPreferencesFromUserDoc(
              data as Record<string, unknown>,
              unit,
              officialInterestIds,
            );
            prefsRef.current = remote;
            setPrefs(remote);
            appliedEpochRef.current = 0;
          } else if (
            shouldApplyRemotePreferences({
              inFlightWrites: inFlightWritesRef.current,
              localEpoch: localEpochRef.current,
              appliedEpoch: appliedEpochRef.current,
            })
          ) {
            const remote = parseSearchPreferencesFromUserDoc(
              data as Record<string, unknown>,
              unit,
              officialInterestIds,
            );
            prefsRef.current = remote;
            setPrefs(remote);
            appliedEpochRef.current = localEpochRef.current;
          }

          // Same-update path as setProfile: rising-edge true must clear sticky
          // permissionsValid=false before paint (BUG-VIS-01). Do not wait for effect.
          const nextVisibility =
            data.visibility === undefined ? undefined : !!data.visibility;
          const previousVisibility = previousVisibilityRef.current;
          previousVisibilityRef.current = nextVisibility;
          const permissionPatch =
            resolvePermissionValidationOnVisibilitySnapshot({
              previousVisibility,
              nextVisibility,
              crjActivationProvisional: crjProvisionalActiveRef.current,
            });
          if (permissionPatch) {
            setPermissionsValid(permissionPatch.permissionsValid);
            setPermissionValidationPending(
              permissionPatch.permissionValidationPending,
            );
          }
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

  // Belt for non-snapshot Visibility flips (local setProfile). Snapshot path
  // already advances previousVisibilityRef + clears sticky synchronously.
  useEffect(() => {
    const next =
      profile.visibility === undefined ? undefined : !!profile.visibility;
    const prev = previousVisibilityRef.current;
    if (prev === next) return;
    previousVisibilityRef.current = next;
    if (shouldResetPermissionValidationOnVisibilityChange(prev, next)) {
      setPermissionsValid(undefined);
      setPermissionValidationPending(true);
    } else if (next === false && !crjProvisionalActiveRef.current) {
      setPermissionsValid(false);
      setPermissionValidationPending(false);
    }
  }, [profile.visibility]);

  // Permission validation for hydration — provisional Active does not start runtime.
  // Also runs under CRJ provisional while Firestore may still report cached false.
  useEffect(() => {
    if (loading) return;
    if (profile.visibility !== true && !crjProvisionalActive) return;
    if (permissionsValid !== undefined) return;

    let cancelled = false;
    (async () => {
      setPermissionValidationPending(true);
      try {
        const fg = await Location.getForegroundPermissionsAsync();
        const ok = fg.status === 'granted' || !!fg.granted;
        if (cancelled) return;
        setPermissionsValid(ok);
        setPermissionValidationPending(false);
        // Reinstall education owns FG prompt when recovery flagged — do not
        // deactivate here while post-login recovery is pending.
      } catch {
        if (!cancelled) {
          setPermissionValidationPending(false);
          setPermissionsValid(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, profile.visibility, permissionsValid, crjProvisionalActive]);

  // Drop the one-shot CRJ provisional flag once Visibility/permissions conclude.
  useEffect(() => {
    if (!crjProvisionalActive) return;
    if (profile.visibility === true && permissionsValid === true) {
      setCrjProvisionalActive(false);
      return;
    }
    if (permissionsValid === false && !permissionValidationPending) {
      setCrjProvisionalActive(false);
    }
  }, [
    crjProvisionalActive,
    profile.visibility,
    permissionsValid,
    permissionValidationPending,
  ]);

  useEffect(() => {
    (async () => {
      const asked = await AsyncStorage.getItem(CONTACTS_ASKED_KEY);
      if (asked === '1') return;
      await AsyncStorage.setItem(CONTACTS_ASKED_KEY, '1');
      await setContactsSyncEnabled(false);
    })();
  }, []);

  // Focus recovery depends only on loading — profile.visibility/bgVisible churn
  // must not cancel reinstall education (iOS-approved pattern).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid || loading) return;
        try {
          // Reinstall / existing account: local education mark absent → full education
          // even if Visibility/bgVisible remote true and OS BG still granted.
          if (!postLoginRecoveryStartedRef.current) {
            const recoveryFlag = consumePostLoginLocationRecovery(uid);
            const localSeen = await hasSeenBackgroundLocationEducation();
            if (
              shouldForceFullBackgroundEducation({
                localEducationSeen: localSeen,
                recoveryNeeded: recoveryFlag || !localSeen,
              })
            ) {
              postLoginRecoveryStartedRef.current = true;
              const perm = await ensureForegroundPermission();
              if (cancelled) return;
              if (perm.status !== 'granted') {
                setPermissionsValid(false);
                setPermissionValidationPending(false);
                const client = await getVisibilityDiscoveryClient();
                const outcome = await deactivateVisibilityFlow(client);
                if (outcome.ok) {
                  setProfile((p) => ({ ...p, visibility: false }));
                }
                await stopBackgroundLocation().catch(() => {});
                return;
              }
              setPermissionsValid(true);
              setPermissionValidationPending(false);
              // No preparation between FG and education.
              await offerBackgroundEducationIfNeeded({ forceFull: true });
              return;
            }
          }

          const client = await getVisibilityDiscoveryClient();
          const remote = !!profileRef.current.visibility;
          const recoveryIntent = await readVisibilityRecoveryIntent(
            AsyncStorage,
          );
          const fg = await Location.getForegroundPermissionsAsync();
          const foregroundGranted = fg.status === 'granted';

          const decision = decideVisibilityRecoveryAction({
            uid,
            remoteVisibility: remote,
            foregroundGranted,
            recoveryIntent,
          });

          if (decision.action === 'preserve-intent-then-deactivate') {
            const result = await reconcileVisibilityWithForegroundPermission({
              remoteVisibility: true,
              client,
              uid,
              recoveryStorage: AsyncStorage,
            });
            if (cancelled) return;
            if (result.reconciled) {
              setProfile((p) => ({ ...p, visibility: false }));
              await stopBackgroundLocation().catch(() => {});
            }
            return;
          }

          if (decision.action === 'activate-from-intent') {
            const restore = await activateVisibilityFlow(client);
            if (cancelled) return;
            if (restore.ok) {
              await clearVisibilityRecoveryIntent(AsyncStorage);
              setProfile((p) => ({ ...p, visibility: true }));
              setPermissionsValid(true);
              await offerBackgroundEducationIfNeeded();
            }
            return;
          }

          if (decision.action === 'await-permission') {
            await stopBackgroundLocation().catch(() => {});
            return;
          }

          if (decision.action === 'clear-intent') {
            await clearVisibilityRecoveryIntent(AsyncStorage);
          }

          if (remote && foregroundGranted && permissionsValid === true) {
            const bgPerm = await Location.getBackgroundPermissionsAsync();
            const bgGranted = bgPerm.status === 'granted';
            if (profileRef.current.bgVisible && !bgGranted) {
              const { updateUserProfilePartial } = await import(
                '../services/firestoreService'
              );
              await updateUserProfilePartial(uid, {
                bgVisible: false,
                updatedAt: Date.now(),
              }).catch(() => {});
              setProfile((p) => ({ ...p, bgVisible: false }));
              await stopBackgroundLocation().catch(() => {});
            } else if (profileRef.current.bgVisible) {
              await startGatedBackgroundIfAllowed(uid);
            } else {
              await stopBackgroundLocation().catch(() => {});
            }
          } else if (!remote) {
            await stopBackgroundLocation().catch(() => {});
          }
        } catch {
          // best-effort
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loading, startGatedBackgroundIfAllowed, offerBackgroundEducationIfNeeded]),
  );

  const showVisibilityError = (
    presentation: VisibilityErrorPresentation,
    err?: unknown,
  ) => {
    setVisibilityError(presentation);
    logVisibilityErrorDiagnostic('MainHome.visibility', presentation, err);
    Alert.alert(presentation.title, presentation.userMessage);
  };

  const showVisibilityPermissionDenied = (
    presentation: VisibilityErrorPresentation,
    _canAskAgain?: boolean,
  ) => {
    setVisibilityError(presentation);
    logVisibilityErrorDiagnostic('MainHome.visibility', presentation);
    const openSettingsLabel = t(
      'onboarding.profileCompletion.gallery.openSettings' as any,
    );
    // activateVisibilityFlow already requested permission when the OS could
    // still prompt. Any remaining denial must offer Settings recovery —
    // including soft-deny — so the user is never stuck on OK-only.
    Alert.alert(presentation.title, presentation.userMessage, [
      {
        text: t('common.actions.cancel'),
        style: 'cancel',
        onPress: () => {
          pendingVisibilityIntentRef.current = false;
        },
      },
      {
        text: openSettingsLabel,
        onPress: () => {
          pendingVisibilityIntentRef.current = true;
          void Linking.openSettings();
        },
      },
    ]);
  };

  const announceInterestLimit = useCallback(() => {
    const title = t('home.discovery.maxInterestsTitle');
    const message = t('home.discovery.maxInterests');
    setInterestLimitMessage(message);
    AccessibilityInfo.announceForAccessibility(message);
    Alert.alert(title, message);
  }, [t]);

  const patchAndPersist = useCallback(
    async (patch: PrefsFieldPatch) => {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;

      const draft = applyModeFieldPatch(prefsRef.current, mode, patch);
      const prepared = prepareSearchPreferencesForPersist(
        draft[mode],
        officialInterestIds,
      );
      if (prepared.ok === false) {
        if (prepared.reasons.includes(INTEREST_IDS_OVER_MAX_REASON)) {
          announceInterestLimit();
        }
        return;
      }

      const optimistic: VisibilitySearchPreferencesByMode = {
        ...draft,
        [mode]: prepared.prefs,
      };
      localEpochRef.current += 1;
      const epoch = localEpochRef.current;
      prefsRef.current = optimistic;
      setPrefs(optimistic);
      setInterestLimitMessage(null);

      inFlightWritesRef.current += 1;
      try {
        const updated = await persistSearchPreferencesForMode(
          uid,
          optimistic,
          mode,
          prepared.prefs,
        );
        if (epoch === localEpochRef.current) {
          prefsRef.current = updated;
          setPrefs(updated);
          appliedEpochRef.current = epoch;
        }
      } catch (err) {
        if (epoch === localEpochRef.current) {
          Alert.alert(t('home.errors.title'), t('home.errors.generic'));
        }
        const text = err instanceof Error ? err.message : '';
        if (text.includes(INTEREST_IDS_OVER_MAX_REASON)) {
          announceInterestLimit();
        }
      } finally {
        inFlightWritesRef.current = Math.max(0, inFlightWritesRef.current - 1);
      }
    },
    [announceInterestLimit, mode, officialInterestIds, t],
  );

  const activateVisibility = useCallback(async () => {
    if (statusUpdatingRef.current) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    setStatusUpdating(true);
    setVisibilityError(null);
    try {
      const client = await getVisibilityDiscoveryClient();
      const outcome = await activateVisibilityFlow(client);
      if (outcome.ok === false) {
        if (outcome.kind === 'permission-denied') {
          showVisibilityPermissionDenied(
            presentVisibilityLocalError('permission-denied', t),
            outcome.canAskAgain,
          );
        } else if (outcome.kind === 'invalid-accuracy') {
          Alert.alert(
            t('settings.backgroundVisibility.approximateTitle'),
            t('settings.backgroundVisibility.approximateMessage'),
            [
              { text: t('common.actions.cancel'), style: 'cancel' },
              {
                text: t('settings.backgroundVisibility.openSettings'),
                onPress: () => {
                  pendingVisibilityIntentRef.current = true;
                  void Linking.openSettings();
                },
              },
            ],
          );
        } else if (outcome.kind === 'unavailable') {
          Alert.alert(
            t('settings.backgroundVisibility.gpsOffTitle'),
            t('settings.backgroundVisibility.gpsOffMessage'),
            [
              { text: t('common.actions.cancel'), style: 'cancel' },
              {
                text: t('settings.backgroundVisibility.openSettings'),
                onPress: () => void Linking.openSettings(),
              },
            ],
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
      setPermissionsValid(true);
      setPermissionValidationPending(false);
      await clearVisibilityRecoveryIntent(AsyncStorage).catch(() => {});
      await offerBackgroundEducationIfNeeded();
    } catch (err) {
      if (isVisibilityDiscoveryClientError(err)) {
        showVisibilityError(presentVisibilityCallableError(err, t), err);
      } else {
        showVisibilityError(presentUnknownVisibilityError(t), err);
      }
    } finally {
      setStatusUpdating(false);
    }
  }, [t, offerBackgroundEducationIfNeeded]);

  const handleToggleActive = async () => {
    const toggleDisabled = isVisibilityToggleDisabled({
      hydrating: visibilityHydration.toggleDisabled,
      mutating: statusUpdating || statusUpdatingRef.current,
    });
    if (toggleDisabled) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    const goingActive = !visibilityHydration.displayActive;
    if (goingActive) {
      await activateVisibility();
      return;
    }

    setStatusUpdating(true);
    setVisibilityError(null);
    try {
      const client = await getVisibilityDiscoveryClient();
      const outcome = await deactivateVisibilityFlow(client);
      if (outcome.ok === false) {
        showVisibilityError(
          presentVisibilityCallableError(outcome.error, t),
          outcome.error,
        );
        return;
      }
      setProfile((p) => ({ ...p, visibility: false }));
      await clearVisibilityRecoveryIntent(AsyncStorage).catch(() => {});
      await stopBackgroundLocation().catch(() => {});
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

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isNowActive = nextState === 'active';
      appStateRef.current = nextState;

      if (wasBackground && isNowActive) {
        // BUG-DISC-01: restore Visibility from preserved intent after Settings grant
        try {
          const uid = firebaseAuth.currentUser?.uid;
          if (uid && !statusUpdatingRef.current) {
            const client = await getVisibilityDiscoveryClient();
            const recoveryIntent = await readVisibilityRecoveryIntent(
              AsyncStorage,
            );
            const perm = await Location.getForegroundPermissionsAsync();
            const decision = decideVisibilityRecoveryAction({
              uid,
              remoteVisibility: !!profileRef.current.visibility,
              foregroundGranted: perm.status === 'granted',
              recoveryIntent,
            });
            if (decision.action === 'activate-from-intent') {
              const restore = await activateVisibilityFlow(client);
              if (restore.ok) {
                await clearVisibilityRecoveryIntent(AsyncStorage);
                setProfile((p) => ({ ...p, visibility: true }));
                pendingVisibilityIntentRef.current = false;
                if (profileRef.current.bgVisible) {
                  await startGatedBackgroundIfAllowed(uid);
                }
                return;
              }
            }
          }
        } catch {
          // best-effort
        }

        if (!pendingVisibilityIntentRef.current) return;

        let foregroundStatus = 'undetermined';
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          foregroundStatus = perm.status;
        } catch {
          foregroundStatus = 'undetermined';
        }

        const evaluation = evaluateVisibilitySettingsReturn(
          pendingVisibilityIntentRef.current,
          foregroundStatus,
        );

        if (evaluation.clearIntent) {
          pendingVisibilityIntentRef.current = false;
        }

        if (evaluation.shouldActivate) {
          if (profileRef.current.visibility || statusUpdatingRef.current) return;
          await activateVisibility();
          return;
        }

        // Background enable return from Settings (after disclosure).
        if (pendingBgEnableFromSettingsRef.current) {
          const uid = firebaseAuth.currentUser?.uid;
          if (!uid) {
            pendingBgEnableFromSettingsRef.current = false;
            return;
          }
          let fgStatus = 'undetermined';
          let bgStatus = 'undetermined';
          try {
            const fg = await Location.getForegroundPermissionsAsync();
            fgStatus = fg.status;
            const bg = await Location.getBackgroundPermissionsAsync();
            bgStatus = bg.status;
          } catch {
            // keep undetermined
          }
          const bgEval = evaluateBackgroundLocationSettingsReturn(
            true,
            fgStatus,
            bgStatus,
          );
          pendingBgEnableFromSettingsRef.current = false;
          if (bgEval.shouldActivate && profileRef.current.visibility) {
            const { updateUserProfilePartial } = await import(
              '../services/firestoreService'
            );
            await updateUserProfilePartial(uid, {
              bgVisible: true,
              updatedAt: Date.now(),
            });
            setProfile((p) => ({ ...p, bgVisible: true }));
            await startGatedBackgroundIfAllowed(uid);
          }
        }
      }
    });

    return () => sub.remove();
  }, [activateVisibility, startGatedBackgroundIfAllowed]);

  const atInterestLimit =
    activePrefs.interestIds.length >= MAX_SEARCH_INTEREST_IDS;

  const addInterest = (id: string) => {
    const current = selectPreferencesForMode(prefsRef.current, mode);
    if (!canAddSearchInterest(current.interestIds, id, officialInterestIds)) {
      announceInterestLimit();
      return;
    }
    Keyboard.dismiss();
    void patchAndPersist({
      kind: 'interests',
      interestIds: [...current.interestIds, id],
    });
  };

  const removeInterest = (id: string) => {
    setInterestLimitMessage(null);
    const current = selectPreferencesForMode(prefsRef.current, mode);
    void patchAndPersist({
      kind: 'interests',
      interestIds: current.interestIds.filter((x) => x !== id),
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

  const canSearch = isHomeSearchEnabled({
    displayActive: visibilityHydration.displayActive,
    permissionsValid,
  });
  const modeLabel =
    mode === 'personal'
      ? t('home.modePersonal')
      : t('home.modeProfessional');

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingBottom: 96 + insets.bottom,
      }}
      keyboardShouldPersistTaps="always"
      scrollEnabled={scrollEnabled}
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
            visibilityHydration.displayActive
              ? t('home.visibility.active')
              : t('home.visibility.inactive')
          }
          disabled={isVisibilityToggleDisabled({
            hydrating: visibilityHydration.toggleDisabled,
            mutating: statusUpdating,
          })}
          onPress={handleToggleActive}
          style={({ pressed }) => [
            styles.statusPill,
            {
              backgroundColor: pillColors.bg,
              borderColor: pillColors.border,
              opacity: statusUpdating || visibilityHydration.toggleDisabled
                ? 0.7
                : 1,
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
            {statusUpdating || visibilityHydration.phase === 'unknown'
              ? '…'
              : visibilityHydration.displayActive
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
                min: displayAgeMin,
                max: displayAgeMax,
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
            low={displayAgeMin}
            high={displayAgeMax}
            accessibilityLabel={t('home.preferences.ageRange')}
            onDragStateChange={(dragging) => setScrollEnabled(!dragging)}
            onChange={(ageMin, ageMax) => {
              setAgeVisual({ ageMin, ageMax });
            }}
            onChangeEnd={(ageMin, ageMax) => {
              setAgeVisual(null);
              void patchAndPersist({ kind: 'age', ageMin, ageMax });
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
              onDragStateChange={(dragging) => setScrollEnabled(!dragging)}
              onChange={(nextDisplay) => {
                setDistanceVisual(nextDisplay);
              }}
              onChangeEnd={(nextDisplay) => {
                setDistanceVisual(null);
                const current = selectPreferencesForMode(
                  prefsRef.current,
                  mode,
                );
                const canonical = resolveCanonicalAfterDisplayClose(
                  current.maxDistanceMeters,
                  nextDisplay,
                  unit,
                );
                void patchAndPersist({
                  kind: 'distance',
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

          {MVP_FREE_SHOW_INTEREST_SEARCH_FILTER ? (
            <InterestMatchSelector
              officialIds={officialInterestIds}
              selectedIds={activePrefs.interestIds}
              atLimit={atInterestLimit}
              limitMessage={interestLimitMessage}
              onAdd={addInterest}
              onRemove={removeInterest}
              onLimitReached={announceInterestLimit}
            />
          ) : null}
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
      </View>
    </ScrollView>
    <BackgroundLocationDisclosureModal
      visible={bgDisclosureVisible}
      variant={bgDisclosureVariant}
      busy={bgDisclosureBusy}
      settingsPath={requiresSettingsForBackgroundPermission(Platform.Version)}
      onEnable={() => void completeBackgroundDisclosure(true)}
      onNotNow={() => void completeBackgroundDisclosure(false)}
    />
    </>
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
});
