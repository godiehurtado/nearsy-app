// src/screens/ProfileDetailScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Alert,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAuth } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { IMAGES } from '../constants/images';
import type { InterestAffiliations, InterestLabel } from '../types/profile';

// 1) Extiende el tipo local
type ProfileDoc = {
  realName?: string;
  profileImage?: string | null;
  topBarColor?: string;
  mode?: 'personal' | 'professional';
  occupation?: string;
  company?: string;
  bio?: string;

  // Intereses por modo
  personalInterestAffiliations?: InterestAffiliations;
  professionalInterestAffiliations?: InterestAffiliations;
  // LEGACY (fallback)
  interestAffiliations?: InterestAffiliations;

  // 👇 Social por modo (nuevo esquema)
  socialLinksPersonal?: Partial<
    Record<
      | 'facebook'
      | 'instagram'
      | 'linkedin'
      | 'twitter'
      | 'youtube'
      | 'tiktok'
      | 'snapchat'
      | 'website',
      string
    >
  >;
  socialLinksProfessional?: Partial<
    Record<
      | 'facebook'
      | 'instagram'
      | 'linkedin'
      | 'twitter'
      | 'youtube'
      | 'tiktok'
      | 'snapchat'
      | 'website',
      string
    >
  >;

  // (opcional si quieres contar fotos en este screen)
  photosPersonal?: { url: string; path?: string }[];
  photosProfessional?: { url: string; path?: string }[];
};

const SOCIAL_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  facebook: { icon: 'logo-facebook', color: '#1877F2' },
  instagram: { icon: 'logo-instagram', color: '#E1306C' },
  linkedin: { icon: 'logo-linkedin', color: '#0A66C2' },
  twitter: { icon: 'logo-twitter', color: '#1DA1F2' },
  youtube: { icon: 'logo-youtube', color: '#FF0000' },
  tiktok: { icon: 'logo-tiktok', color: '#000000' },
  snapchat: { icon: 'logo-snapchat', color: '#fffc00' },
  website: { icon: 'globe-outline', color: '#1E3A8A' },
};

function normalizeUrl(u: string) {
  if (!u) return '';
  // si viene sin protocolo, agrega https://
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

async function openLink(url: string) {
  const safe = normalizeUrl(url);
  const can = await Linking.canOpenURL(safe);
  if (!can) {
    Alert.alert('Link inválido', 'No se pudo abrir este enlace.');
    return;
  }
  Linking.openURL(safe);
}

type Params = { uid: string };

export default function ProfileDetailScreen() {
  type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ProfileDetail'>;
  const nav = useNavigation<NavProp>();
  const route = useRoute<RouteProp<Record<string, Params>, string>>();
  const uidp = route.params?.uid;

  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<ProfileDoc>({});
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState<ProfileDoc | null>(null);

  const topColor = profile.topBarColor || '#3B5A85';

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const uid = getAuth().currentUser?.uid;
        if (!uid) return;
        const ref = doc(firestore, 'users', uid);
        const unsub = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as ProfileDoc);
          }
        });
        return unsub;
      } catch (error) {
        console.error('❌ Error fetching profile data:', error);
        Alert.alert('Error', 'Could not load your profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  // 2) Elige los social links según el modo del perfil que estás viendo
  const socialForMode = useMemo(() => {
    if (!p) return {};
    return (
      (p.mode === 'professional'
        ? p.socialLinksProfessional
        : p.socialLinksPersonal) ?? {}
    );
  }, [p?.mode, p?.socialLinksPersonal, p?.socialLinksProfessional]);

  useEffect(() => {
    (async () => {
      try {
        if (!uidp) return;
        const snap = await getDoc(doc(firestore, 'users', uidp));
        setP(snap.exists() ? (snap.data() as ProfileDoc) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [uidp]);

  const firstName = (full?: string) =>
    full ? full.trim().split(/\s+/)[0] || 'Unnamed' : 'Unnamed';

  // 4) Afiliaciones: soporta imageKey o imageUrl (por si subieron iconos propios)
  const affiliationsList = useMemo(() => {
    const affObj: InterestAffiliations =
      (p?.mode === 'professional'
        ? p?.professionalInterestAffiliations
        : p?.personalInterestAffiliations) ??
      p?.interestAffiliations ?? // legacy
      {};

    // Aplanar
    const items: {
      label: InterestLabel;
      imageKey?: keyof typeof IMAGES;
      imageUrl?: string;
      name?: string;
    }[] = [];

    Object.entries(affObj).forEach(([label, picks]) => {
      (picks ?? []).forEach((pick) => {
        items.push({
          label: label as InterestLabel,
          imageKey: pick?.imageKey as keyof typeof IMAGES | undefined,
          imageUrl: pick?.imageUrl, // 👈 soporta custom
          name: pick?.name,
        });
      });
    });

    return items;
  }, [
    p?.mode,
    p?.personalInterestAffiliations,
    p?.professionalInterestAffiliations,
    p?.interestAffiliations,
  ]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }
  if (!p) {
    return (
      <View style={styles.center}>
        <Text>Profile not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}
    >
      <View style={styles.headerImageWrap}>
        {p.profileImage ? (
          <Image source={{ uri: p.profileImage }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#E5E7EB' }]} />
        )}

        <TouchableOpacity
          onPress={() => nav.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.container}>
        <Text style={styles.name}>{p.realName}</Text>
        <Text style={styles.subtle}>
          {p.mode === 'professional' ? 'Professional' : 'Personal'}
        </Text>

        {Object.values(socialForMode).some(Boolean) && (
          <View style={styles.socialRow}>
            {Object.entries(socialForMode)
              .filter(([, url]) => !!url)
              .map(([key, url]) => {
                const meta = SOCIAL_META[key] || SOCIAL_META.website;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => openLink(url!)}
                    activeOpacity={0.8}
                    style={styles.socialBtn}
                  >
                    <Ionicons name={meta.icon} size={30} color={meta.color} />
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
        <Text style={styles.occupationTitle}>{p.occupation}</Text>
        {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}
        {/* Company (si existe) */}
        {p.company ? (
          <>
            <Text style={styles.sectionTitle}>Company</Text>
            <Text style={styles.companyName}>{p.company}</Text>
          </>
        ) : null}
        {affiliationsList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Affiliations</Text>
            <View style={styles.logoGrid}>
              {affiliationsList.map((a, idx) => {
                const src = a.imageKey
                  ? IMAGES[a.imageKey]
                  : { uri: a.imageUrl! };
                return (
                  <View
                    key={`${a.label}-${a.imageKey || a.imageUrl || idx}`}
                    style={styles.logoCell}
                  >
                    <Image
                      source={src as any}
                      style={styles.logoImg}
                      resizeMode="contain"
                    />
                    <Text style={styles.logoCaption} numberOfLines={1}>
                      {a.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
        <View style={{ height: 12 }} />
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: topColor }]}
          activeOpacity={0.9}
          onPress={() =>
            nav.navigate('ProfileGallery', { uid: uidp, mode: p.mode })
          } // 👈 pasa mode
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="images-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>Open gallery</Text>
          </View>
        </TouchableOpacity>
        {/* <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#E5E7EB' }]}
          activeOpacity={0.9}
          onPress={() => nav.goBack()}
        >
          <Text style={[styles.btnText, { color: '#111827' }]}>Back</Text>
        </TouchableOpacity> */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 20, paddingBottom: 30 },
  avatar: {
    width: '100%',
    height: 300,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignSelf: 'center',
  },

  // contenedor relativo para posicionar el botón encima
  headerImageWrap: {
    position: 'relative',
  },

  // botón flotante arriba-izquierda
  backBtn: {
    position: 'absolute',
    top: 40, // si quieres subir/bajar, ajusta este valor
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', // se ve bien sobre cualquier imagen
    alignItems: 'center',
    justifyContent: 'center',
  },

  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'right',
  },
  subtle: { textAlign: 'right', color: '#6B7280', marginBottom: 16 },
  occupationTitle: {
    fontWeight: '800',
    fontSize: 24,
    color: '#111827',
    marginTop: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#111827',
    marginTop: 10,
    marginBottom: 6,
  },
  bio: { color: '#374151', lineHeight: 20, fontSize: 16 },

  // --- NUEVO: grid 3 por fila, sin recuadros ---
  logoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  logoCell: {
    width: '25%', // 3 por fila
    paddingHorizontal: 6,
    marginBottom: 12,
    alignItems: 'center',
  },
  logoImg: {
    width: '100%',
    height: 40, // ajusta según necesites
  },
  logoCaption: {
    marginTop: 4,
    fontSize: 12,
    color: '#374151',
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginVertical: 8,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  socialBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6', // gris muy claro
  },

  btn: {
    marginTop: 10,
    marginBottom: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
});
