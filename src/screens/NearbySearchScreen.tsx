// src/screens/NearbySearchScreen.tsx ✅ RNFirebase-only
import React, { useCallback, useEffect, useState } from 'react';
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
  Linking,
} from 'react-native';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';

import type { HomeStackParamList } from '../navigation/HomeStack';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { adjustColor } from '../utils/colors';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

type UserDoc = {
  uid?: string;
  realName?: string;
  profileImage?: string | null;
  topBarColor?: string;
  visibility?: boolean;
  bio?: string;
  status?: string;

  personalInterests?: string[];
  professionalInterests?: string[];

  occupation?: string;
  company?: string;
  mode?: 'personal' | 'professional';
  location?: { lat: number; lng: number; updatedAt?: number };

  email?: string;
  phone?: string;
  blockedContacts?: string[];

  // 🔹 flags para modo demo / reviewer
  isDemoUser?: boolean;
  isReviewer?: boolean;
};

type ProfileDoc = {
  profileImage?: string | null;
  realName?: string;
  topBarColor?: string;
  visibility?: boolean;

  phone?: string;
  email?: string;
  blockedContacts?: string[];

  // 🔹 flag para saber si el usuario actual es revisor (cuenta de Apple)
  isReviewer?: boolean;
};

type NearbyItem = UserDoc & { distanceFt?: number };

// Constantes de distancia / vigencia
const R_EARTH_M = 6371_000; // metros
const FEET_PER_METER = 3.28084;
const MAX_FEET = 20; // 20 ft ≈ 15.24 m
const MAX_METERS = MAX_FEET / FEET_PER_METER;
const STALE_MS = 30 * 60 * 1000; // ubicación del usuario válida por 30 min

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R_EARTH_M * c;
}

function normalizeId(value?: string | null): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function isBlockedBetween(
  myEmail?: string | null,
  myPhone?: string | null,
  myBlockedContacts?: string[] | null,
  otherEmail?: string | null,
  otherPhone?: string | null,
  otherBlockedContacts?: string[] | null,
) {
  const meIds = [normalizeId(myEmail), normalizeId(myPhone)].filter(Boolean);
  const otherIds = [normalizeId(otherEmail), normalizeId(otherPhone)].filter(
    Boolean,
  );

  const myBlocked = (myBlockedContacts ?? []).map(normalizeId);
  const otherBlocked = (otherBlockedContacts ?? []).map(normalizeId);

  // Yo bloqueé al otro
  const iBlockedOther = otherIds.some((id) => myBlocked.includes(id));

  // El otro me bloqueó a mí
  const otherBlockedMe = meIds.some((id) => otherBlocked.includes(id));

  return iBlockedOther || otherBlockedMe;
}

async function getUsablePosition(): Promise<{
  lat: number;
  lng: number;
} | null> {
  const perm = await Location.getForegroundPermissionsAsync();

  if (perm.status === 'denied') {
    Alert.alert(
      'Location disabled',
      'Enable location in Settings to see people near you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings?.() },
      ],
    );
    return null;
  }

  if (perm.status === 'undetermined') {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
  }

  // granted
  const last = await Location.getLastKnownPositionAsync();
  if (last?.coords) {
    return { lat: last.coords.latitude, lng: last.coords.longitude };
  }

  const now = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { lat: now.coords.latitude, lng: now.coords.longitude };
}

export default function NearbySearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<NearbyItem[]>([]);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [hasLocation, setHasLocation] = useState(true);

  const topColor = profile.topBarColor || '#3B5A85';

  const firstName = (full?: string) => {
    if (!full) return 'Unnamed';
    const [f] = full.trim().split(/\s+/);
    return f || 'Unnamed';
  };

  const baseColor: string = profile.topBarColor ?? '#3B5A85';
  const light2: string = adjustColor(baseColor, 100);

  // ✅ Suscripción a mi perfil (RNFirebase)
  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsub = firestoreDb
      .collection('users')
      .doc(uid)
      .onSnapshot(
        (snap) => {
          if (snap.exists) {
            setProfile(snap.data() as ProfileDoc);
          }
          // NO apagues loading aquí: loadData también lo controla
        },
        (err) => {
          if (__DEV__)
            console.error('[NearbySearch] profile onSnapshot error:', err);
          Alert.alert('Error', 'Could not load your profile.');
        },
      );

    return () => unsub();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const authUser = firebaseAuth.currentUser;
      const me = authUser?.uid;
      const myEmail = authUser?.email ?? null;

      if (!me) {
        setItems([]);
        return;
      }

      const myPhone = profile.phone ?? null;
      const myBlockedContacts = profile.blockedContacts ?? null;
      const isReviewer = profile.isReviewer === true;

      // ⚠️ Para reviewers, no obligamos a tener ubicación
      const myPos = await getUsablePosition();

      if (!myPos && !isReviewer) {
        setHasLocation(false);
        setItems([]);
        return;
      }

      setHasLocation(!!myPos);

      // ✅ RNFirebase query: solo visibles (luego filtramos)
      // Nota: aquí no usamos orderBy para evitar requerir índice/updatedAt.
      const snap = await firestoreDb
        .collection('users')
        .where('visibility', '==', true)
        .limit(300)
        .get();

      const now = Date.now();
      const nearby: NearbyItem[] = [];

      snap.forEach((d) => {
        if (d.id === me) return;
        const data = d.data() as UserDoc;

        // 🔒 BLOQUEO MUTUO POR EMAIL / TELÉFONO
        const blocked = isBlockedBetween(
          myEmail,
          myPhone,
          myBlockedContacts,
          data.email ?? null,
          data.phone ?? null,
          data.blockedContacts ?? null,
        );
        if (blocked) return;

        // 🔹 MODO REVIEWER (Apple)
        if (isReviewer) {
          // Para el revisor, mostramos sólo usuarios demo
          if (!data.isDemoUser) return;

          nearby.push({
            ...data,
            uid: d.id,
          });
          return;
        }

        // 🔹 COMPORTAMIENTO NORMAL (usuarios reales)
        const loc = data.location;
        const updatedAt = loc?.updatedAt ?? 0;

        if (!loc?.lat || !loc?.lng) return;
        if (updatedAt && now - updatedAt > STALE_MS) return;

        if (!myPos) return;

        const distM = distanceMeters(myPos, { lat: loc.lat, lng: loc.lng });
        if (distM <= MAX_METERS) {
          nearby.push({
            ...data,
            uid: d.id,
            distanceFt: Math.round(distM * FEET_PER_METER),
          });
        }
      });

      nearby.sort((a, b) => (a.distanceFt ?? 0) - (b.distanceFt ?? 0));
      setItems(nearby);
    } catch (e: any) {
      if (__DEV__) console.error('[NearbySearch] Nearby load error:', e);
      Alert.alert('Error', e?.message || 'Could not load nearby profiles.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [profile.phone, profile.blockedContacts, profile.isReviewer]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      {/* Barra superior */}
      <View style={[styles.topBar, { backgroundColor: topColor }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.brandContainer}>
          <Image
            source={require('../assets/icon_white.png')}
            style={styles.brandIcon}
          />
          <Text style={styles.brandText}>Nearsy</Text>
        </View>

        {/* Espacio derecho para centrar la marca */}
        <View style={styles.topBtn} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.uid!}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Discovery</Text>
            <Text style={styles.headerHint}>
              {hasLocation
                ? 'Showing people near you'
                : 'Enable location to see people near you'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Card
            light2={light2}
            image={item.profileImage || undefined}
            name={`${firstName(item.realName)}${
              item.realName?.includes(' ')
                ? ' ' + item.realName!.split(/\s+/)[1]?.[0] + '.'
                : ''
            }`}
            occupation={item.occupation}
            status={item.status}
            isReversed={index % 2 === 1}
            onPress={() =>
              navigation.navigate('ProfileDetail', { uid: item.uid! })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.footerText}>(Pull to refresh)</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ color: '#64748B' }}>
              {hasLocation
                ? 'No nearby profiles found.'
                : 'Location is off. Turn it on and pull to refresh.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

function Card({
  light2,
  image,
  name,
  occupation,
  status,
  onPress,
  isReversed = false,
}: {
  light2?: string;
  image?: string;
  name: string;
  occupation?: string;
  status?: string;
  onPress?: () => void;
  isReversed?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        isReversed && {
          flexDirection: 'row-reverse',
          justifyContent: 'flex-start',
        },
      ]}
    >
      {/* Imagen clickeable */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {image ? (
          <Image source={{ uri: image }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#E5E7EB' }]} />
        )}
      </TouchableOpacity>

      {/* Texto y pill */}
      <View style={styles.cardTextContainer}>
        <Text style={styles.cardName} numberOfLines={1}>
          {name}
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={[styles.pill, light2 ? { backgroundColor: light2 } : null]}
        >
          <Text style={styles.pillText} numberOfLines={1}>
            {occupation || '—'}
          </Text>
          <Text style={styles.pillText} numberOfLines={1}>
            {status || '—'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    height: 60,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  topBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  brandIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    marginRight: 8,
  },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 18 },

  header: { padding: 16, paddingBottom: 0, alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1F2937' },
  headerHint: { color: '#6B7280', fontSize: 12 },

  card: {
    marginHorizontal: 16,
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatar: { width: 100, height: 100, borderRadius: 12 },

  cardTextContainer: { flex: 1, alignItems: 'flex-start' },

  cardName: {
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'left',
    alignSelf: 'flex-start',
    fontSize: 18,
    marginLeft: 10,
  },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
    width: '100%',
  },
  pillText: {
    color: '#1E3A8A',
    fontWeight: '600',
    textAlign: 'left',
  },

  footer: { alignItems: 'center', paddingVertical: 18 },
  footerText: {
    backgroundColor: '#EEF2F7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    color: '#334155',
  },
  sep: {
    height: 3,
    backgroundColor: '#F3F4F6',
    marginLeft: 20,
    marginRight: 20,
  },
});
