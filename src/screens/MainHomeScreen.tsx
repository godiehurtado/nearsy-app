// src/screens/MainHomeScreen.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { updateUserProfilePartial } from '../services/firestoreService';
import TopHeader from '../components/TopHeader';
import { useFocusEffect } from '@react-navigation/native'; // 👈 nuevo

type ProfileDoc = {
  profileImage?: string | null;
  realName?: string;
  topBarColor?: string;
  visibility?: boolean;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';
};

type Props = NativeStackScreenProps<any>;

export default function MainHomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileDoc>({});
  const [statusUpdating, setStatusUpdating] = useState(false);

  const firstName = useMemo(() => {
    const rn = (profile.realName || '').trim();
    if (!rn) return 'Unnamed';
    const [first] = rn.split(/\s+/);
    return first || 'Unnamed';
  }, [profile.realName]);

  useEffect(() => {
    const subscribe = async () => {
      try {
        const uid = getAuth().currentUser?.uid;
        if (!uid) return;
        const ref = doc(firestore, 'users', uid);
        const unsub = onSnapshot(ref, (snap) => {
          if (snap.exists()) setProfile(snap.data() as ProfileDoc);
          setLoading(false);
        });
        return unsub;
      } catch (error) {
        if (__DEV__) {
          console.error('[MainHome] Error fetching profile data:', error);
        }
        Alert.alert('Error', 'Could not load your profile.');
        setLoading(false);
      }
    };
    subscribe();
  }, []);

  // 🔄 Refresca ubicación cuando vuelves a esta pantalla (solo si está ACTIVE)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          if (!profile.visibility) return;
          const uid = getAuth().currentUser?.uid;
          if (!uid) return;

          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status !== 'granted') return;

          const pos = await Location.getCurrentPositionAsync({
            accuracy:
              Platform.OS === 'android'
                ? Location.Accuracy.Lowest
                : Location.Accuracy.Balanced,
          });
          if (cancelled) return;

          await updateUserProfilePartial(uid, {
            location: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              updatedAt: Date.now(),
            },
          });
        } catch {
          // opcional: silencio
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [profile.visibility]),
  );

  const handleToggleActive = async () => {
    if (statusUpdating) return;

    const auth = getAuth();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const goingActive = !profile.visibility;

    try {
      setStatusUpdating(true);

      // 1) Cambio rápido en Firestore SOLO de visibility
      await updateUserProfilePartial(uid, { visibility: goingActive });

      // 2) Actualizar estado local inmediatamente (UI responde al toque)
      setProfile((p) => ({ ...p, visibility: goingActive }));
    } catch (e) {
      if (__DEV__) {
        console.error('[MainHome] Error toggling visibility', e);
      }
      Alert.alert('Error', 'Could not update your status.');
      return;
    } finally {
      setStatusUpdating(false);
    }

    // 3) Si activamos, tratamos de actualizar la ubicación en background (no bloquea la UI)
    if (goingActive) {
      updateLocationInBackground(uid);
    }
  };

  const updateLocationInBackground = (uid: string) => {
    (async () => {
      try {
        // 1) Permisos de ubicación
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== 'granted') {
            if (__DEV__) {
              console.warn('[MainHome] Location permission not granted');
            }
            return; // no molestamos al usuario, solo no guardamos ubicación
          }
        }

        // 2) Intentar obtener ubicación con precisión más baja en Android
        const pos = await Location.getCurrentPositionAsync({
          accuracy:
            Platform.OS === 'android'
              ? Location.Accuracy.Low
              : Location.Accuracy.Balanced,
        });

        await updateUserProfilePartial(uid, {
          location: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            updatedAt: Date.now(),
          },
        });

        if (__DEV__) {
          console.log('[MainHome] Location updated in background');
        }
      } catch (err) {
        if (__DEV__) {
          console.warn(
            '[MainHome] Failed to update location in background',
            err,
          );
        }
        // Nada de alertas aquí: no queremos molestar al usuario si el GPS falla
      }
    })();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  const topColor = profile.topBarColor || '#3B5A85';
  const canSearch = !!profile.visibility; // 👈 habilitación

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
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
        <Text style={styles.name}>{firstName}</Text>
        <Text style={styles.subtle}>Your account is</Text>

        <TouchableOpacity
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
              styles.activeDot,
              profile.visibility ? styles.dotOn : styles.dotOff,
            ]}
          >
            ✓
          </Text>
          <Text
            style={[
              styles.activeText,
              { color: profile.visibility ? '#0F5132' : '#6B7280' },
            ]}
          >
            {statusUpdating
              ? profile.visibility
                ? 'UPDATING...'
                : 'ACTIVATING...'
              : profile.visibility
              ? 'ACTIVE'
              : 'INACTIVE'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          You control when you're visible to others.
        </Text>

        <Text style={styles.sectionTitle}>Find interesting people nearby?</Text>
        <Text style={styles.paragraph}>
          Browse temporary profiles of others to facilitate meaningful in-person
          connections.
        </Text>

        {/* Botón Discovery */}
        <TouchableOpacity
          activeOpacity={canSearch ? 0.85 : 1}
          disabled={!canSearch}
          onPress={() => navigation.navigate('NearbySearch')}
          style={[
            styles.searchBtn,
            { backgroundColor: canSearch ? '#3B5A85' : '#9CA3AF' },
            !canSearch && { opacity: 0.6 },
          ]}
        >
          <View style={styles.searchIconWrap}>
            <Image
              source={require('../assets/search_icon.png')}
              style={{ width: 70, height: 70, resizeMode: 'contain' }}
            />
          </View>
          <Text style={styles.searchText}>Discovery</Text>
        </TouchableOpacity>

        {!canSearch && (
          <Text style={{ color: '#6B7280', textAlign: 'center', marginTop: 8 }}>
            Turn your account <Text style={{ fontWeight: '700' }}>ACTIVE</Text>{' '}
            to use Discovery.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 20, // espacio debajo del avatar colgante
    alignItems: 'center',
  },

  name: { fontSize: 26, fontWeight: '800', color: '#1F2937' },
  subtle: { marginTop: 4, color: '#6B7280' },

  // Pill ACTIVO/INACTIVO
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  activeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    textAlignVertical: 'center' as any,
    fontWeight: '700',
  },
  dotOn: {
    backgroundColor: '#A8BDDA',
    color: '#3B5A85',
  },
  dotOff: {
    backgroundColor: '#E5E7EB',
    color: '#6B7280',
  },
  activeText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  sectionTitle: {
    marginTop: 40,
    fontWeight: '700',
    fontSize: 16,
    color: '#1F2937',
    textAlign: 'center',
  },
  paragraph: {
    marginTop: 6,
    color: '#334155',
    textAlign: 'center',
  },

  searchBtn: {
    marginTop: 14,
    width: '86%',
    alignSelf: 'center',
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
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
  searchText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },

  footerNote: {
    marginTop: 8,
    color: '#6B7280',
    textAlign: 'center',
  },
});
