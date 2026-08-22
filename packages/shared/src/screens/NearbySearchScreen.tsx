/**
 * NearbySearchScreen — discoverNearby callable MVP (no peer Firestore reads).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Localization from 'expo-localization';
import { doc, onSnapshot } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme';
import {
  buildDiscoverNearbyRequest,
  isVisibilityDiscoveryClientError,
  metersToFeet,
  resolveDistanceDisplayUnit,
  type DiscoverNearbyResult,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

type ProfileDoc = {
  visibility?: boolean;
  topBarColor?: string;
};

export default function NearbySearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const unit = resolveDistanceDisplayUnit(
    Localization.getLocales()?.[0]?.languageTag,
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<DiscoverNearbyResult[]>([]);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', uid), (snap) => {
      if (snap.exists()) setProfile((snap.data() as ProfileDoc) ?? {});
    });
    return () => unsub();
  }, []);

  const loadData = useCallback(async (showFullScreenLoader: boolean) => {
    if (showFullScreenLoader) setLoading(true);
    setErrorMessage(null);
    try {
      if (!firebaseAuth.currentUser?.uid) {
        setItems([]);
        return;
      }
      if (!profile.visibility) {
        setItems([]);
        setErrorMessage(t('home.visibility.inactiveHint'));
        return;
      }

      const client = await getVisibilityDiscoveryClient();
      const response = await client.discoverNearby(
        buildDiscoverNearbyRequest({ limit: 50 }),
      );
      setItems(response.results);
    } catch (err) {
      if (__DEV__) console.error('[NearbySearch] discoverNearby', err);
      if (isVisibilityDiscoveryClientError(err)) {
        if (err.reason.kind === 'known' && err.reason.value === 'visibility-inactive') {
          setErrorMessage(t('home.visibility.inactiveHint'));
        } else if (
          err.reason.kind === 'known' &&
          (err.reason.value === 'location-stale' ||
            err.reason.value === 'location-missing')
        ) {
          setErrorMessage(t('nearby.hintWithoutLocation'));
        } else if (err.retryable) {
          setErrorMessage('Temporary error. Pull to refresh.');
        } else {
          setErrorMessage(t('nearby.emptyWithLocation'));
        }
      } else {
        setErrorMessage('Could not load nearby profiles.');
      }
      setItems([]);
    } finally {
      if (showFullScreenLoader) setLoading(false);
    }
  }, [profile.visibility, t]);

  useEffect(() => {
    const full = !hasLoadedOnce.current;
    hasLoadedOnce.current = true;
    void loadData(full);
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
      return `${Math.round(metersToFeet(meters))} ft`;
    }
    return `${Math.round(meters)} m`;
  };

  const topColor = profile.topBarColor || palette.primary;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: insets.top,
      }}
    >
      <View style={[styles.topBar, { backgroundColor: topColor }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.brandText}>Nearsy</Text>
        <View style={styles.topBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.uid}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: palette.textPrimary }]}>
              {t('nearby.title')}
            </Text>
            <Text style={[styles.headerHint, { color: palette.textMuted }]}>
              {errorMessage ?? t('nearby.hintWithLocation')}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const p = item.profile;
          const shared = p.interestIds.slice(0, 3).join(' · ');
          return (
            <TouchableOpacity
              style={[styles.card, { borderColor: palette.border }]}
              onPress={() =>
                navigation.navigate('DiscoveryProfile', { uid: item.uid })
              }
              accessibilityRole="button"
            >
              {p.profileImage ? (
                <Image source={{ uri: p.profileImage }} style={styles.avatar} />
              ) : (
                <View
                  style={[styles.avatar, { backgroundColor: palette.chipBg }]}
                />
              )}
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.cardName, { color: palette.textPrimary }]}
                >
                  {p.displayName}
                </Text>
                <Text style={{ color: palette.textSecondary }}>
                  {p.occupation || p.mode} · {p.ageYears}
                </Text>
                {!!shared && (
                  <Text style={{ color: palette.textMuted, marginTop: 2 }}>
                    {shared}
                  </Text>
                )}
              </View>
              <Text style={{ color: palette.primary, fontWeight: '700' }}>
                {formatDistance(item.distanceMeters)}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: palette.textMuted }}>
              {errorMessage ?? t('nearby.emptyWithLocation')}
            </Text>
          </View>
        }
        ListFooterComponent={
          <Text
            style={{
              textAlign: 'center',
              color: palette.textMuted,
              marginTop: 16,
            }}
          >
            {t('nearby.pullToRefresh')}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  topBtn: { width: 40, alignItems: 'center' },
  brandText: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800' },
  header: { paddingVertical: 16 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  headerHint: { marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  cardName: { fontWeight: '700', fontSize: 16 },
});
