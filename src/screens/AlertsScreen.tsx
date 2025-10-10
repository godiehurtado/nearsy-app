// src/screens/AlertsScreen.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
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
import { registerPushToken } from '../services/pushTokens';

type AlertKind = 'interest_nearby' | 'contact_nearby';

type AlertItem = {
  id: string;
  uid?: string;
  name: string;
  avatar?: string | null;
  kind: AlertKind;
  distanceFt?: number; // ✅ pies
  sharedInterests?: string[];
  at: number;
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

  // filtros y bloqueos
  birthYear?: number;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  blockedContacts?: string[];
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

// ✅ coherencia con 500 ft
const FEET_PER_METER = 3.28084;
const FEET_500_IN_KM = 0.1524; // 500 ft ≈ 152.4 m
const LOCATION_FRESH_MS = 5 * 60 * 1000;
const AUTO_REFRESH_MS = 30 * 1000;

export default function AlertsScreen() {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabsParamList>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topColor, setTopColor] = useState('#3B5A85');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [me, setMe] = useState<UserDoc | null>(null);

  const insets = useSafeAreaInsets();
  const currentYear = useMemo(() => new Date().getFullYear(), []); // ✅
  const intervalRef = useRef<NodeJS.Timer | null>(null); // ✅

  // Reasegura el token push al abrir esta screen (barato e idempotente)
  useEffect(() => {
    registerPushToken().catch(() => {});
  }, []);

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

    // Reglas base: debo estar visible y tener location válida
    if (!me.visibility || !me.location?.lat || !me.location?.lng) {
      setAlerts([]);
      return;
    }

    try {
      const q1 = query(
        collection(firestore, 'users'),
        where('visibility', '==', true),
        limit(200),
      );
      const s = await getDocs(q1);

      const myPoint = { lat: me.location.lat, lng: me.location.lng };
      const now = Date.now();

      const myAge =
        typeof me.birthYear === 'number' ? currentYear - me.birthYear : null;

      const myBlocked = new Set(me.blockedContacts ?? []);

      // 🔹 Optimización: mis intereses se calculan una sola vez
      const myInterests = new Set(
        [
          ...(me.personalInterests ?? []),
          ...(me.professionalInterests ?? []),
        ].map((x) => (x || '').toLowerCase()),
      );

      const results: AlertItem[] = [];

      s.forEach((d) => {
        if (d.id === uid) return;
        const u = d.data() as UserDoc & {
          birthYear?: number;
          visibleToMinAge?: number | null;
          visibleToMaxAge?: number | null;
          blockedContacts?: string[];
        };

        // 🚫 Bloqueos (mutuos)
        const otherBlocked = new Set(u.blockedContacts ?? []);
        if (myBlocked.has(d.id) || otherBlocked.has(uid)) return;

        // 🚫 Edad fuera de rango (mutuos)
        const theirAge =
          typeof u.birthYear === 'number' ? currentYear - u.birthYear : null;

        if (myAge !== null) {
          if (u.visibleToMinAge && myAge < u.visibleToMinAge) return;
          if (u.visibleToMaxAge && myAge > u.visibleToMaxAge) return;
        }
        if (theirAge !== null) {
          if (me.visibleToMinAge && theirAge < me.visibleToMinAge) return;
          if (me.visibleToMaxAge && theirAge > me.visibleToMaxAge) return;
        }

        // 🚫 Ubicación inválida o vieja
        const loc = u.location;
        if (!loc?.lat || !loc?.lng) return;
        if (loc.updatedAt && now - loc.updatedAt > LOCATION_FRESH_MS) return;

        // Distancia → en ft
        const km = haversineKm(myPoint, { lat: loc.lat, lng: loc.lng });
        if (km > FEET_500_IN_KM) return;
        const meters = km * 1000;
        const feet = meters * FEET_PER_METER;

        // Intereses compartidos (para etiquetar la alerta)
        const otherInterests = new Set(
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
          distanceFt: Math.round(feet), // ✅ UI en pies
          sharedInterests: shared.slice(0, 3),
          at: loc.updatedAt || now,
        });
      });

      // Ordenar por distancia (menor primero)
      results.sort((a, b) => (a.distanceFt ?? 0) - (b.distanceFt ?? 0));
      setAlerts(results);
    } catch (err) {
      // Si hay error de permisos/red
      setAlerts([]);
    }
  }, [me, currentYear]);

  // Inicial + auto refresh (un solo intervalo estable) ✅
  useEffect(() => {
    if (!me) {
      setAlerts([]);
      return;
    }
    setLoading(true);
    buildAlerts().finally(() => setLoading(false));

    let id: ReturnType<typeof setInterval> | null = null;
    id = setInterval(() => {
      buildAlerts();
    }, AUTO_REFRESH_MS);

    return () => {
      if (id) clearInterval(id as unknown as number);
    };
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
            <Text style={styles.headerTitle}>Alerts (real-time)</Text>
            <Text
              style={{ textAlign: 'center', color: '#6B7280', marginTop: 6 }}
            >
              Showing only users within 500 ft right now.
            </Text>
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
              // Si usas el ref global, aquí puedes conservar:
              // (navigationRef as any).navigate('Home', { screen: 'ProfileDetail', params: { uid: item.uid } });
              navigation.navigate('Home', {
                screen: 'ProfileDetail',
                params: { uid: item.uid },
              } as any);
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
