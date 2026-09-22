/**
 * NearbySearchScreen — designed discovery list (callable results only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Localization from 'expo-localization';
import { firebaseAuth } from '../config/firebaseConfig';
import { dbOnUserSnapshot } from '../services/db';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';
import { subtleShadow } from '../theme/shadows';
import { NearbyInterestIconRow } from '../components/visibility/NearbyInterestIconRow';
import { AlignmentScoreRing } from '../components/alignment/AlignmentScoreRing';
import {
  isVisibilityDiscoveryClientError,
  metersToFeet,
  resolveDistanceDisplayUnit,
  toAlignment,
  type DiscoverNearbyResult,
} from '../visibility';
import {
  alignmentAccessibilityLabel,
  alignmentTierLabel,
  shouldShowNearbyTierBadge,
} from '../visibility/alignmentPresentation';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import {
  countSharedInterestIds,
  matchesNearbyLocalQuery,
  resolveInterestChips,
} from '../visibility/interestDisplay';
import { loadNearbyWithContractualRefresh } from '../visibility/nearbyDiscoveryLoad';
import {
  isNearbyViewerVisibilityConfirmedOff,
  shouldApplyNearbyLoadOutcome,
  shouldClearNearbyItemsOnOutcomeFailure,
  shouldShowNearbyEmptyState,
  shouldShowNearbyFullScreenLoading,
} from '../visibility/nearbyLoadUiState';
import {
  presentVisibilityCallableError,
  presentVisibilityLocalError,
} from '../visibility/visibilityErrorPresentation';

type ProfileDoc = {
  visibility?: boolean;
  searchPreferences?: unknown;
  mode?: string;
};

export default function NearbySearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette, theme } = useAppTheme();
  const unit = resolveDistanceDisplayUnit(
    Localization.getLocales()?.[0]?.languageTag,
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<DiscoverNearbyResult[]>([]);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [query, setQuery] = useState('');
  const [errorKind, setErrorKind] = useState<
    'none' | 'inactive' | 'empty' | 'retry' | 'generic'
  >('none');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** True only after the first loadData attempt finishes (finally). */
  const [initialFetchCompleted, setInitialFetchCompleted] = useState(false);
  const initialFetchCompletedRef = useRef(false);
  /** True after first profile snapshot — avoids false "Visibility is off". */
  const [profileHydrated, setProfileHydrated] = useState(false);
  /** Bumps on every loadData entry; stale async outcomes are ignored (BUG-DISC-05). */
  const loadGenerationRef = useRef(0);
  const isFocusedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const translateItem = useCallback(
    (nameKey: string, fallback: string) =>
      t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
        defaultValue: fallback,
      }),
    [t],
  );

  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setProfileHydrated(true);
      return;
    }
    const unsub = dbOnUserSnapshot(uid, (raw) => {
      setProfile((raw as ProfileDoc) ?? {});
      setProfileHydrated(true);
    });
    return () => unsub();
  }, []);

  const viewerInterestIds = useMemo(() => {
    const prefs = profile.searchPreferences as
      | {
          personal?: { interestIds?: string[] };
          professional?: { interestIds?: string[] };
        }
      | undefined;
    const mode = profile.mode === 'professional' ? 'professional' : 'personal';
    const ids = prefs?.[mode]?.interestIds;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  }, [profile.mode, profile.searchPreferences]);

  const loadData = useCallback(
    async (showFullScreenLoader: boolean) => {
      const generation = ++loadGenerationRef.current;
      const stillCurrent = () =>
        shouldApplyNearbyLoadOutcome(generation, loadGenerationRef.current);

      if (showFullScreenLoader) {
        setLoading(true);
        setErrorKind('none');
        setErrorMessage(null);
      }
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) {
          if (!stillCurrent()) return;
          if (shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader })) {
            setItems([]);
          }
          setErrorKind('generic');
          setErrorMessage(t('nearby.errorGeneric'));
          return;
        }
        if (!profileHydrated) {
          // Wait for profile snapshot; do not treat unknown visibility as off.
          return;
        }
        if (
          isNearbyViewerVisibilityConfirmedOff({
            profileHydrated,
            visibility: profile.visibility,
          })
        ) {
          if (!stillCurrent()) return;
          if (shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader })) {
            setItems([]);
          }
          setErrorKind('inactive');
          setErrorMessage(t('nearby.inactiveBody'));
          return;
        }

        const client = await getVisibilityDiscoveryClient();
        const outcome = await loadNearbyWithContractualRefresh({
          uid,
          visibility: true,
          client,
          limit: 50,
        });

        if (!stillCurrent()) return;

        if (outcome.ok === false) {
          if (shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader })) {
            setItems([]);
          }
          if (outcome.kind === 'inactive') {
            setErrorKind('inactive');
            setErrorMessage(t('nearby.inactiveBody'));
            return;
          }
          if (outcome.kind === 'permission-denied') {
            setErrorKind('generic');
            setErrorMessage(t('nearby.hintWithoutLocation'));
            return;
          }
          if (
            outcome.kind === 'unavailable' ||
            outcome.kind === 'invalid-accuracy'
          ) {
            const presented = presentVisibilityLocalError(outcome.kind, t);
            setErrorKind('retry');
            setErrorMessage(t('nearby.errorRetry'));
            if (__DEV__) {
              console.warn('[NearbySearch] local', presented.devDetail);
            }
            return;
          }
          if (outcome.kind === 'unauthenticated') {
            setErrorKind('generic');
            setErrorMessage(t('nearby.errorGeneric'));
            return;
          }
          const err = outcome.error;
          if (err && isVisibilityDiscoveryClientError(err)) {
            if (
              err.reason.kind === 'known' &&
              err.reason.value === 'visibility-inactive'
            ) {
              setErrorKind('inactive');
              setErrorMessage(t('nearby.inactiveBody'));
            } else if (err.retryable) {
              setErrorKind('retry');
              setErrorMessage(t('nearby.errorRetry'));
            } else {
              const presented = presentVisibilityCallableError(err, t);
              setErrorKind('generic');
              setErrorMessage(presented.userMessage);
            }
          } else {
            setErrorKind('generic');
            setErrorMessage(t('nearby.errorGeneric'));
          }
          if (__DEV__ && err) {
            console.error('[NearbySearch] discover/publish', err);
          }
          return;
        }

        // Success replaces the list with the latest discoverNearby set.
        setItems(outcome.results);
        if (outcome.results.length === 0) {
          setErrorKind('empty');
          setErrorMessage(t('nearby.emptyBody'));
        } else {
          setErrorKind('none');
          setErrorMessage(null);
        }
      } catch (err) {
        if (!stillCurrent()) return;
        if (__DEV__) console.error('[NearbySearch] loadData', err);
        if (shouldClearNearbyItemsOnOutcomeFailure({ showFullScreenLoader })) {
          setItems([]);
        }
        if (isVisibilityDiscoveryClientError(err)) {
          if (
            err.reason.kind === 'known' &&
            err.reason.value === 'visibility-inactive'
          ) {
            setErrorKind('inactive');
            setErrorMessage(t('nearby.inactiveBody'));
          } else if (err.retryable) {
            setErrorKind('retry');
            setErrorMessage(t('nearby.errorRetry'));
          } else {
            const presented = presentVisibilityCallableError(err, t);
            setErrorKind('generic');
            setErrorMessage(presented.userMessage);
          }
        } else {
          setErrorKind('generic');
          setErrorMessage(t('nearby.errorGeneric'));
        }
      } finally {
        if (!stillCurrent()) return;
        if (!profileHydrated && firebaseAuth.currentUser?.uid) {
          // Keep initial full-screen loading until visibility is known.
          if (showFullScreenLoader) setLoading(true);
          return;
        }
        if (showFullScreenLoader) setLoading(false);
        initialFetchCompletedRef.current = true;
        setInitialFetchCompleted(true);
      }
    },
    [profile.visibility, profileHydrated, t],
  );

  useEffect(() => {
    // Full-screen loader only until the first fetch completes; later
    // loadData identity changes (e.g. visibility snapshot) stay silent.
    void loadData(!initialFetchCompletedRef.current);
  }, [loadData]);

  // BUG-DISC-05: re-query when returning to Nearby (e.g. detail → back).
  // Skip the first focus while the mount effect still owns the initial load.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (initialFetchCompletedRef.current) {
        void loadData(false);
      }
      return () => {
        isFocusedRef.current = false;
      };
    }, [loadData]),
  );

  // BUG-DISC-05: re-query when the app returns to foreground while Nearby is focused.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const wasBg = appStateRef.current.match(/inactive|background/);
      const isActive = next === 'active';
      appStateRef.current = next;
      if (
        wasBg &&
        isActive &&
        isFocusedRef.current &&
        initialFetchCompletedRef.current
      ) {
        void loadData(false);
      }
    });
    return () => sub.remove();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const formatDistance = (meters: number) => {
    if (unit === 'ft') {
      return t('nearby.distanceAwayFt', {
        value: Math.round(metersToFeet(meters)),
      });
    }
    return t('nearby.distanceAwayM', { value: Math.round(meters) });
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const chips = resolveInterestChips(
        item.profile.interestIds,
        translateItem,
        12,
      );
      return matchesNearbyLocalQuery(query, {
        displayName: item.profile.displayName,
        occupation: item.profile.occupation ?? '',
        interestLabels: chips.map((c) => c.label),
      });
    });
  }, [items, query, translateItem]);

  const headerBg = theme === 'dark' ? palette.panel : palette.panel;
  const listPadBottom = 96 + insets.bottom;
  const showFullScreenLoading = shouldShowNearbyFullScreenLoading({
    loading,
    initialFetchCompleted,
    profileHydrated,
  });
  const showEmptyState = shouldShowNearbyEmptyState({
    fullScreenLoading: showFullScreenLoading,
    itemCount: filtered.length,
    errorKind,
  });

  const renderCard = ({ item }: { item: DiscoverNearbyResult }) => {
    const p = item.profile;
    const chips = resolveInterestChips(p.interestIds, translateItem);
    const shared = countSharedInterestIds(viewerInterestIds, p.interestIds);
    const metaParts = [p.occupation?.trim() || null, formatDistance(item.distanceMeters)]
      .filter(Boolean);
    const alignment = toAlignment(item.compatibility);
    const showAlignmentRing = alignment?.available === true;
    const cardA11y =
      showAlignmentRing && alignment
        ? `${p.displayName}, ${alignmentAccessibilityLabel(t, alignment)}`
        : p.displayName;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cardA11y}
        onPress={() =>
          navigation.navigate('DiscoveryProfile', { uid: item.uid })
        }
        style={({ pressed }) => [
          styles.card,
          subtleShadow,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            opacity: pressed ? 0.96 : 1,
          },
        ]}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.avatarWrap}>
            {p.profileImage ? (
              <Image source={{ uri: p.profileImage }} style={styles.avatar} />
            ) : (
              <View
                style={[styles.avatar, { backgroundColor: palette.chipBg }]}
              >
                <Ionicons
                  name="person"
                  size={24}
                  color={palette.textMuted}
                />
              </View>
            )}
            <View
              style={[
                styles.nearDot,
                {
                  backgroundColor: palette.success,
                  borderColor: palette.surface,
                },
              ]}
            />
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTitleRow}>
              <Text
                style={[styles.cardName, { color: palette.textPrimary }]}
                numberOfLines={1}
              >
                {p.displayName}
              </Text>
              {shared > 0 ? (
                <Text style={[styles.sharedBadge, { color: palette.primary }]}>
                  {t('nearby.sharedCount', { count: shared })}
                </Text>
              ) : null}
            </View>
            <Text
              style={[styles.cardMeta, { color: palette.textSecondary }]}
              numberOfLines={1}
            >
              {metaParts.join(' · ')}
            </Text>
          </View>
          {showAlignmentRing && alignment ? (
            <View style={styles.alignmentColumn} pointerEvents="none">
              <AlignmentScoreRing score={alignment.score} variant="compact" />
              {shouldShowNearbyTierBadge(alignment.tier) ? (
                <Text
                  style={[styles.alignmentBadge, { color: palette.primary }]}
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.35}
                >
                  {alignmentTierLabel(t, alignment.tier)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <NearbyInterestIconRow chips={chips} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.md,
            backgroundColor: headerBg,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nearby.back')}
          onPress={() => navigation.goBack()}
          style={[
            styles.backBtn,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.textPrimary} />
        </Pressable>

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: palette.textPrimary }]}>
              {t('nearby.title')}
            </Text>
            <Text style={[styles.tagline, { color: palette.textSecondary }]}>
              {t('nearby.tagline')}
            </Text>
          </View>
          <View style={styles.countBlock}>
            <Text style={[styles.countLabel, { color: palette.textMuted }]}>
              {t('nearby.peopleNearby')}
            </Text>
            <Text style={[styles.countValue, { color: palette.primary }]}>
              {filtered.length}
            </Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchField,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <Ionicons name="search-outline" size={16} color={palette.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('nearby.searchPlaceholder')}
              placeholderTextColor={palette.placeholder}
              style={[styles.searchInput, { color: palette.textPrimary }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('nearby.filters')}
            onPress={() => navigation.navigate('MainHome')}
            style={[
              styles.filterBtn,
              { backgroundColor: palette.chipBg },
            ]}
          >
            <Ionicons name="options-outline" size={18} color={palette.primary} />
          </Pressable>
        </View>
      </View>

      {showFullScreenLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textMuted }]}>
            {t('nearby.loading')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.uid}
          renderItem={renderCard}
          contentContainerStyle={{
            paddingHorizontal: screenPadding.horizontal,
            paddingTop: spacing.md,
            paddingBottom: listPadBottom,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            showEmptyState ? (
            <View style={styles.emptyWrap}>
              <View
                style={[
                  styles.emptyIcon,
                  {
                    backgroundColor: palette.panel,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Ionicons
                  name="search-outline"
                  size={22}
                  color={palette.textMuted}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
                {errorKind === 'inactive'
                  ? t('nearby.inactiveTitle')
                  : errorKind === 'retry'
                    ? t('nearby.errorTitle')
                    : t('nearby.emptyTitle')}
              </Text>
              <Text
                style={[styles.emptyBody, { color: palette.textSecondary }]}
              >
                {errorMessage ?? t('nearby.emptyBody')}
              </Text>
              {errorKind === 'inactive' ? (
                <Pressable
                  onPress={() => navigation.navigate('MainHome')}
                  style={[styles.cta, { backgroundColor: palette.textPrimary }]}
                >
                  <Text style={styles.ctaLabel}>{t('nearby.goHome')}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void loadData(true)}
                  style={[styles.cta, { backgroundColor: palette.textPrimary }]}
                >
                  <Text style={styles.ctaLabel}>{t('nearby.retry')}</Text>
                </Pressable>
              )}
            </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: screenPadding.horizontal,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
  },
  tagline: {
    marginTop: 3,
    fontSize: fontSize.sm,
  },
  countBlock: { alignItems: 'flex-end' },
  countLabel: { fontSize: fontSize.xs },
  countValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  searchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: { fontSize: fontSize.sm },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  alignmentColumn: {
    width: 78,
    flexShrink: 0,
    alignItems: 'center',
    gap: 4,
  },
  alignmentBadge: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
    lineHeight: 14,
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  sharedBadge: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    flexShrink: 0,
  },
  cardMeta: {
    marginTop: 2,
    fontSize: fontSize.sm,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  cta: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontWeight: fontWeight.semibold,
    fontSize: fontSize.base,
  },
});
