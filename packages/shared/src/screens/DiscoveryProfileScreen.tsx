/**
 * Safe Discovery Profile Detail — getDiscoveryProfile only (no peer user doc).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';

import type { HomeStackParamList } from '../navigation/HomeStack';
import { useAppTheme } from '../theme';
import {
  buildGetDiscoveryProfileRequest,
  isVisibilityDiscoveryClientError,
  metersToFeet,
  resolveDistanceDisplayUnit,
  type GetDiscoveryProfileResponse,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

export default function DiscoveryProfileScreen() {
  const route = useRoute<RouteProp<HomeStackParamList, 'DiscoveryProfile'>>();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const uid = route.params?.uid;
  const unit = resolveDistanceDisplayUnit(
    Localization.getLocales()?.[0]?.languageTag,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GetDiscoveryProfileResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid) {
        setError('Missing profile.');
        setLoading(false);
        return;
      }
      try {
        const client = await getVisibilityDiscoveryClient();
        const response = await client.getDiscoveryProfile(
          buildGetDiscoveryProfileRequest(uid),
        );
        if (!cancelled) setData(response);
      } catch (err) {
        if (!cancelled) {
          if (
            isVisibilityDiscoveryClientError(err) &&
            err.reason.kind === 'known'
          ) {
            setError('This profile is no longer available.');
          } else {
            setError('Could not load profile.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  const distanceLabel =
    data &&
    (unit === 'ft'
      ? `${Math.round(metersToFeet(data.distanceMeters))} ft`
      : `${Math.round(data.distanceMeters)} m`);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: insets.top,
      }}
    >
      <View style={[styles.topBar, { backgroundColor: palette.primary }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.brand}>Profile</Text>
        <View style={styles.topBtn} />
      </View>

      {error || !data ? (
        <View style={styles.center}>
          <Text style={{ color: palette.textMuted }}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {data.profile.profileImage ? (
            <Image
              source={{ uri: data.profile.profileImage }}
              style={styles.hero}
            />
          ) : (
            <View
              style={[styles.hero, { backgroundColor: palette.chipBg }]}
            />
          )}
          <Text style={[styles.name, { color: palette.textPrimary }]}>
            {data.profile.displayName}
          </Text>
          <Text style={{ color: palette.textSecondary }}>
            {data.profile.occupation}
            {data.profile.company ? ` · ${data.profile.company}` : ''}
          </Text>
          <Text style={{ color: palette.textMuted, marginTop: 4 }}>
            {data.profile.ageYears} · {data.profile.mode} · {distanceLabel}
          </Text>
          {!!data.profile.bio && (
            <Text
              style={{ color: palette.textPrimary, marginTop: 16, lineHeight: 22 }}
            >
              {data.profile.bio}
            </Text>
          )}
          {data.profile.interestIds.length > 0 && (
            <View style={styles.chips}>
              {data.profile.interestIds.map((id) => (
                <View
                  key={id}
                  style={[styles.chip, { backgroundColor: palette.chipBg }]}
                >
                  <Text style={{ color: palette.chipText, fontSize: 12 }}>
                    {id}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {data.gallery.length > 0 && (
            <View style={styles.gallery}>
              {data.gallery.map((g) => (
                <Image
                  key={g.url}
                  source={{ uri: g.url }}
                  style={styles.galleryImg}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
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
  brand: { flex: 1, textAlign: 'center', color: '#fff', fontWeight: '800' },
  hero: { width: '100%', height: 220, borderRadius: 16 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  galleryImg: { width: 100, height: 100, borderRadius: 8 },
});
