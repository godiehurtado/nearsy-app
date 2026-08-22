/**
 * Alerts — discoverNearby only; opens DiscoveryProfile (no peer user docs).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabsParamList } from '../navigation/RootTabs';

import { registerPushToken } from '../services/pushTokens';
import { useNearbyAlerts } from '../hooks/useNearbyAlerts';

const NEARBY_RADIUS_FT = 200;

const timeAgo = (ms: number) => {
  const diff = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (diff < 60) return `${diff}m`;
  const h = Math.round(diff / 60);
  return `${h}h`;
};

export default function AlertsScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabsParamList>>();
  const { loading, alerts, topColor, me, refresh } = useNearbyAlerts();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    registerPushToken().catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const renderMsg = (a: (typeof alerts)[number]) => {
    const tags = (a.sharedInterests ?? []).slice(0, 2).join(', ');
    const inContactsLabel = a.fromContacts ? ' (in your contacts)' : '';

    if (a.sharedInterests && a.sharedInterests.length > 0) {
      return `${a.name}${inContactsLabel} is near you and you share interests${
        tags ? ` (${tags})` : ''
      }.`;
    }

    return `${a.name}${inContactsLabel} is near you.`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  const inactive = !me?.visibility;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      <View style={[styles.topBar, { backgroundColor: topColor }]}>
        <Image
          source={require('../assets/icon_white.png')}
          style={{
            width: 26,
            height: 26,
            resizeMode: 'contain',
            marginRight: 8,
          }}
        />
        <Text style={styles.brandText}>Nearsy</Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(it) => it.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Alerts (real-time)</Text>
            <Text
              style={{ textAlign: 'center', color: '#6B7280', marginTop: 6 }}
            >
              Showing only users within {NEARBY_RADIUS_FT} ft right now.
            </Text>
            {inactive && (
              <Text
                style={{ textAlign: 'center', color: '#6B7280', marginTop: 6 }}
              >
                Turn your account ACTIVE to receive nearby alerts.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={renderMsg(item)}
            onPress={() => {
              if (!item.uid) return;
              navigation.navigate('Home', {
                screen: 'DiscoveryProfile',
                params: { uid: item.uid },
              });
            }}
          >
            <View style={styles.row}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#E5E7EB' }]} />
              )}
              <View style={styles.textCol}>
                <Text style={styles.msg} numberOfLines={2}>
                  {renderMsg(item)}
                </Text>
                <View style={styles.metaRow}>
                  {typeof item.distanceFt === 'number' && (
                    <Text style={styles.meta}>{item.distanceFt} ft</Text>
                  )}
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.meta}>{timeAgo(item.at)}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 24 }}>
            <Text style={{ color: '#64748B' }}>
              No nearby alerts right now. Pull to refresh.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    height: 52,
    width: '100%',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 18 },

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  textCol: { flex: 1, marginLeft: 12 },
  msg: { color: '#111827', fontSize: 15, fontWeight: '600' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  meta: { color: '#6B7280', fontSize: 12 },
  dot: { color: '#9CA3AF', marginHorizontal: 6 },

  sep: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 84 },
});
