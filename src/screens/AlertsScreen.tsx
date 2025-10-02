// src/screens/AlertsScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RootTabsParamList } from '../navigation/RootTabs';

type AlertKind = 'interest_nearby' | 'contact_nearby';

type AlertItem = {
  id: string;
  uid?: string; // si existe, navegamos al perfil
  name: string; // “Diego H.”
  avatar?: string | null; // url
  kind: AlertKind;
  distanceKm?: number; // para “near you”
  sharedInterests?: string[]; // para “share interests”
  at: number; // timestamp (cuando detectamos la cercanía)
};

type LocationDoc = { lat: number; lng: number; updatedAt?: number };
type UserDoc = {
  uid?: string;
  realName?: string;
  profileImage?: string | null;
  topBarColor?: string;
  visibility?: boolean;
  location?: LocationDoc | null;
  personalInterests?: string[];
  professionalInterests?: string[];
  mode?: 'personal' | 'professional';
};

// ===== utilidades =====
const shortName = (full?: string) => {
  const s = (full || '').trim();
  if (!s) return 'Unnamed';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return s;
  return `${parts[0]} ${parts[1][0]}.`;
};

const timeAgo = (ms: number) => {
  const diff = Math.max(1, Math.round((Date.now() - ms) / 60000)); // mins
  if (diff < 60) return `${diff}m`;
  const h = Math.round(diff / 60);
  return `${h}h`;
};

// Haversine (km)
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const c =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const d = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return R * d;
}

const FEET_500_IN_KM = 0.1524; // 500 ft ≈ 152.4 m
const LOCATION_FRESH_MS = 15 * 60 * 1000; // 15 min “reciente” (ajústalo si quieres)

export default function AlertsScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabsParamList>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topColor, setTopColor] = useState('#3B5A85');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);

  const insets = useSafeAreaInsets();

  // Suscríbete a MI doc: color, visibility y location
  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const ref = doc(firestore, 'users', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserDoc;
        // color
        if (typeof data.topBarColor === 'string' && data.topBarColor) {
          setTopColor(data.topBarColor);
        }
        setMe({ ...data, uid });
      } else {
        setMe(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const buildAlerts = useCallback(async () => {
    const uid = getAuth().currentUser?.uid;
    if (!uid || !me) {
      setAlerts([]);
      return;
    }

    // Si no está ACTIVE o no tiene location válida, no mostramos nada
    if (!me.visibility || !me.location?.lat || !me.location?.lng) {
      setAlerts([]);
      return;
    }

    // Solo usuarios visibles y con location
    // (No podemos filtrar por campo-anidado no-existente con where, así que filtramos en cliente)
    const q1 = query(
      collection(firestore, 'users'),
      where('visibility', '==', true),
      limit(200),
    );
    const s = await getDocs(q1);

    const myPoint = { lat: me.location.lat, lng: me.location.lng };
    const myInterests = new Set<string>(
      [
        ...(me.personalInterests ?? []),
        ...(me.professionalInterests ?? []),
      ].map((x) => (x || '').toLowerCase()),
    );

    const now = Date.now();
    const results: AlertItem[] = [];

    s.forEach((d) => {
      if (d.id === uid) return; // no yo
      const u = d.data() as UserDoc;

      // Debe tener location válida y reciente
      const loc = u.location;
      if (!loc?.lat || !loc?.lng) return;
      if (loc.updatedAt && now - loc.updatedAt > LOCATION_FRESH_MS) return;

      // Distancia
      const km = haversineKm(myPoint, { lat: loc.lat, lng: loc.lng });
      if (km > FEET_500_IN_KM) return;

      // Intereses compartidos (muy simple: strings coincidentes)
      const otherInterests = new Set<string>(
        [
          ...(u.personalInterests ?? []),
          ...(u.professionalInterests ?? []),
        ].map((x) => (x || '').toLowerCase()),
      );

      const shared: string[] = [];
      otherInterests.forEach((tag) => {
        if (myInterests.has(tag)) shared.push(tag);
      });

      const kind: AlertKind =
        shared.length > 0 ? 'interest_nearby' : 'contact_nearby';

      results.push({
        id: `${d.id}-${loc.updatedAt || now}`,
        uid: d.id,
        name: shortName(u.realName),
        avatar: u.profileImage ?? undefined,
        kind,
        distanceKm: km,
        sharedInterests: shared.slice(0, 3), // 3 máx para mostrar
        at: loc.updatedAt || now,
      });
    });

    // Ordenar por “más cercano” o por más reciente; aquí por reciente
    results.sort((a, b) => b.at - a.at);
    setAlerts(results);
  }, [me]);

  // Carga inicial y cada vez que “me” cambie
  useEffect(() => {
    (async () => {
      if (!me) {
        setAlerts([]);
        return;
      }
      setLoading(true);
      try {
        await buildAlerts();
      } finally {
        setLoading(false);
      }
    })();
  }, [me, buildAlerts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await buildAlerts();
    } finally {
      setRefreshing(false);
    }
  }, [buildAlerts]);

  const renderMsg = (a: AlertItem) => {
    if (a.kind === 'contact_nearby') {
      return `${a.name} is near you.`;
    }
    const tags = (a.sharedInterests ?? []).slice(0, 2).join(', ');
    return `${a.name} is near you and you share interests${
      tags ? ` (${tags})` : ''
    }.`;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  const noLocation =
    !me?.visibility || !me?.location?.lat || !me?.location?.lng;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      {/* Top bar sobria */}
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
            <Text style={styles.headerTitle}>Alerts</Text>
            {noLocation && (
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
            onPress={() => {
              if (!item.uid) return;
              navigation.navigate('Home', {
                screen: 'ProfileDetail',
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
                  {typeof item.distanceKm === 'number' && (
                    <Text style={styles.meta}>
                      {item.distanceKm.toFixed(2)} km
                    </Text>
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
