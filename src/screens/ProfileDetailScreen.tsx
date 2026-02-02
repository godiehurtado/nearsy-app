// src/screens/ProfileDetailScreen.tsx  ✅ RNFirebase-only
import React, { useEffect, useMemo, useState } from 'react';
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
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { IMAGES } from '../constants/images';
import type {
  InterestAffiliations,
  InterestLabel,
  AffiliationItem,
  AffiliationCategory,
} from '../types/profile';

// ===== Perfil Firestore =====
type ProfileDoc = {
  realName?: string;
  profileImage?: string | null;
  topBarColor?: string;
  mode?: 'personal' | 'professional';
  occupation?: string;
  company?: string;
  bio?: string;
  status?: string;

  personalInterestAffiliations?: InterestAffiliations;
  professionalInterestAffiliations?: InterestAffiliations;
  interestAffiliations?: InterestAffiliations; // legacy

  personalAffiliations?: AffiliationItem[];
  professionalAffiliations?: AffiliationItem[];

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

const AFFILIATION_CATEGORIES: {
  key: AffiliationCategory;
  title: string;
  subtitle: string;
  emoji: string;
}[] = [
  {
    key: 'schoolCollege',
    title: 'School / College',
    subtitle: 'Universities, schools or colleges that represent you.',
    emoji: '🎓',
  },
  {
    key: 'majorField',
    title: 'Major / Field',
    subtitle: 'Your main area of study or expertise.',
    emoji: '📚',
  },
  {
    key: 'alumniGroup',
    title: 'Alumni Group',
    subtitle: 'Alumni associations or student groups you belong to.',
    emoji: '🏫',
  },
  {
    key: 'favoriteTeam',
    title: 'Favorite Sport Team',
    subtitle: 'Teams or clubs you support.',
    emoji: '⚽',
  },
  {
    key: 'hobbiesClubs',
    title: 'Clubs',
    subtitle: 'Clubs, hobbies or activities you enjoy.',
    emoji: '🎭',
  },
  {
    key: 'industry',
    title: 'Industry',
    subtitle: 'Industries or sectors you feel related to.',
    emoji: '💼',
  },
  {
    key: 'communityGroups',
    title: 'Community Groups',
    subtitle: 'Local groups, NGOs or communities you support.',
    emoji: '🧑‍🤝‍🧑',
  },
  {
    key: 'pets',
    title: 'Pets',
    subtitle: 'Animals or pet communities you love.',
    emoji: '🐶',
  },
];

const INTEREST_DISPLAY_ORDER: InterestLabel[] = [
  'Healthy Lifestyle',
  'Extra-Curricular Activities',
  'Language',
  'Other',
  'Sports',
  'Music',
];

const INTEREST_CATEGORY_META: Partial<
  Record<
    InterestLabel,
    {
      title: string;
      subtitle?: string;
      emoji: string;
    }
  >
> = {
  'Healthy Lifestyle': {
    title: 'Healthy Lifestyle',
    subtitle: 'Habits, wellness and health-related choices.',
    emoji: '🧘',
  },
  'Extra-Curricular Activities': {
    title: 'Extra Activities',
    subtitle: 'Clubs, hobbies and activities you participate in.',
    emoji: '🎭',
  },
  Language: {
    title: 'Languages',
    subtitle: 'Languages you speak or are part of your identity.',
    emoji: '🌍',
  },
  Other: {
    title: 'Other',
    subtitle: 'Beliefs, values or topics that define you.',
    emoji: '✨',
  },
  Sports: {
    title: 'Sports',
    subtitle: 'Sports, teams and physical activities you enjoy.',
    emoji: '🏀',
  },
  Music: {
    title: 'Music',
    subtitle: 'Genres, moods and sounds that describe you.',
    emoji: '🎵',
  },
};

function normalizeUrl(u: string) {
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) return `https://${u}`;
  return u;
}

async function openLink(url: string) {
  const safe = normalizeUrl(url);
  const can = await Linking.canOpenURL(safe);
  if (!can) {
    Alert.alert('Invalid link', 'Could not open this link.');
    return;
  }
  Linking.openURL(safe);
}

export default function ProfileDetailScreen() {
  // ✅ (3) Tipado de route y navigation
  type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ProfileDetail'>;
  type RouteProps = RouteProp<HomeStackParamList, 'ProfileDetail'>;

  const nav = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const uidp = route.params?.uid;

  const insets = useSafeAreaInsets();

  // mi perfil (solo para topColor)
  const [myProfile, setMyProfile] = useState<ProfileDoc>({});

  // perfil visto
  const [p, setP] = useState<ProfileDoc | null>(null);

  // ✅ (1) SOLO un loading (para el perfil visto)
  const [loading, setLoading] = useState(true);

  const topColor = myProfile.topBarColor || '#3B5A85';

  // ✅ (2) Snapshot con cleanup real (RNFirebase)
  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    const unsub = firestoreDb
      .collection('users')
      .doc(uid)
      .onSnapshot(
        (snap) => {
          if (snap.exists) setMyProfile(snap.data() as ProfileDoc);
        },
        (error) => {
          if (__DEV__)
            console.error('[ProfileDetail] myProfile snapshot:', error);
          Alert.alert('Error', 'Could not load your profile.');
        },
      );

    return () => unsub();
  }, []);

  // Carga del perfil que estoy viendo (RNFirebase get)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        if (!uidp) {
          if (!cancelled) setP(null);
          return;
        }

        const snap = await firestoreDb.collection('users').doc(uidp).get();

        if (cancelled) return;
        setP(snap.exists ? (snap.data() as ProfileDoc) : null);
      } catch (e: any) {
        if (__DEV__) console.error('[ProfileDetail] target get error:', e);
        if (!cancelled) {
          setP(null);
          Alert.alert('Error', e?.message || 'Could not load profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uidp]);

  // social links según modo del perfil visto
  const socialForMode = useMemo(() => {
    if (!p) return {};
    return (
      (p.mode === 'professional'
        ? p.socialLinksProfessional
        : p.socialLinksPersonal) ?? {}
    );
  }, [p?.mode, p?.socialLinksPersonal, p?.socialLinksProfessional]);

  const interestGroups = useMemo(() => {
    const affObj: InterestAffiliations =
      (p?.mode === 'professional'
        ? p?.professionalInterestAffiliations
        : p?.personalInterestAffiliations) ??
      p?.interestAffiliations ??
      {};

    const groups = Object.entries(affObj)
      .map(([label, picks]) => ({
        label: label as InterestLabel,
        items: (picks ?? []).map((pick: any) => ({
          id: pick?.id as string,
          name: pick?.name as string,
          emoji: pick?.emoji as string | undefined,
          imageKey: pick?.imageKey as keyof typeof IMAGES | undefined,
          imageUrl: pick?.imageUrl as string | undefined,
        })),
      }))
      .filter((g) => g.items.length > 0);

    const getIndex = (label: InterestLabel) => {
      const idx = INTEREST_DISPLAY_ORDER.indexOf(label);
      return idx === -1 ? INTEREST_DISPLAY_ORDER.length : idx;
    };

    return groups.sort((a, b) => getIndex(a.label) - getIndex(b.label));
  }, [
    p?.mode,
    p?.personalInterestAffiliations,
    p?.professionalInterestAffiliations,
    p?.interestAffiliations,
  ]);

  const affiliationsOrgList = useMemo<AffiliationItem[]>(() => {
    const list =
      (p?.mode === 'professional'
        ? (p as any)?.professionalAffiliations
        : (p as any)?.personalAffiliations) ?? [];
    return Array.isArray(list) ? list : [];
  }, [
    p?.mode,
    (p as any)?.personalAffiliations,
    (p as any)?.professionalAffiliations,
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

  const hasOccupation = !!p.occupation;
  const hasCompany = p.mode === 'professional' && !!p.company;
  const hasBio = !!p.bio;
  const showInfoCard = hasOccupation || hasCompany || hasBio;

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
        <View style={styles.nameRow}>
          <View style={styles.statusColumn} />
          <View style={styles.nameColumn}>
            <Text style={styles.name}>{p.realName}</Text>
            <Text style={styles.subtle}>
              {p.mode === 'professional' ? 'Professional' : 'Personal'}
            </Text>
            {p.status ? (
              <Text style={styles.statusRight} numberOfLines={2}>
                {p.status}
              </Text>
            ) : null}
          </View>
        </View>

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

        {showInfoCard && (
          <View style={styles.infoCard}>
            {hasOccupation && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Occupation</Text>
                <Text style={styles.infoValue}>{p.occupation}</Text>
              </View>
            )}

            {hasCompany && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Company</Text>
                <Text style={styles.infoValue}>{p.company}</Text>
              </View>
            )}

            {hasBio && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoLabel}>Biography</Text>
                <Text style={[styles.infoValue, { lineHeight: 20 }]}>
                  {p.bio}
                </Text>
              </View>
            )}
          </View>
        )}

        {affiliationsOrgList.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Affiliations</Text>

            {AFFILIATION_CATEGORIES.map((cat) => {
              const items = affiliationsOrgList.filter(
                (a) => a.category === cat.key,
              );
              if (!items.length) return null;

              return (
                <View key={cat.key} style={styles.affBlock}>
                  <Text style={styles.affBlockTitle}>
                    {cat.emoji} {cat.title}
                  </Text>
                  <Text style={styles.affBlockSubtitle}>{cat.subtitle}</Text>

                  <View style={styles.logoGrid}>
                    {items.map((item, idx) => {
                      const caption = item.label ?? '';
                      return (
                        <View key={`${cat.key}-${idx}`} style={styles.logoCell}>
                          {item.imageUrl ? (
                            <Image
                              source={{ uri: item.imageUrl }}
                              style={styles.logoImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.logoEmojiCircle}>
                              <Text style={styles.logoEmoji}>{cat.emoji}</Text>
                            </View>
                          )}

                          {!!caption && (
                            <Text style={styles.logoCaption} numberOfLines={2}>
                              {caption}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {interestGroups.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Interests</Text>

            {interestGroups.map((group) => {
              const meta = INTEREST_CATEGORY_META[group.label] ?? null;

              return (
                <View key={group.label} style={styles.affBlock}>
                  <Text style={styles.affBlockTitle}>
                    {meta?.emoji ?? '⭐'} {meta?.title ?? group.label}
                  </Text>
                  {meta?.subtitle && (
                    <Text style={styles.affBlockSubtitle}>{meta.subtitle}</Text>
                  )}

                  <View style={styles.logoGrid}>
                    {group.items.map((item, idx) => {
                      const hasEmoji = !!item.emoji;
                      const src = item.imageKey
                        ? IMAGES[item.imageKey]
                        : item.imageUrl
                          ? { uri: item.imageUrl }
                          : null;

                      return (
                        <View
                          key={`${group.label}-${item.id || idx}`}
                          style={styles.logoCell}
                        >
                          {hasEmoji ? (
                            <View style={styles.logoEmojiCircle}>
                              <Text style={styles.logoEmoji}>{item.emoji}</Text>
                            </View>
                          ) : src ? (
                            <Image
                              source={src as any}
                              style={styles.logoImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.logoEmojiCircle}>
                              <Text style={styles.logoEmoji}>
                                {meta?.emoji ?? '⭐'}
                              </Text>
                            </View>
                          )}

                          {!!item.name && (
                            <Text style={styles.logoCaption} numberOfLines={1}>
                              {item.name}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 12 }} />
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: topColor }]}
          activeOpacity={0.9}
          onPress={() =>
            nav.navigate('ProfileGallery', { uid: uidp, mode: p.mode })
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="images-outline" size={18} color="#fff" />
            <Text style={styles.btnText}>Open gallery</Text>
          </View>
        </TouchableOpacity>
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
  headerImageWrap: { position: 'relative' },
  backBtn: {
    position: 'absolute',
    top: 40,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 10,
  },
  statusColumn: { flex: 1, paddingRight: 8 },
  nameColumn: { flexShrink: 1, alignItems: 'flex-end' },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'right',
  },
  subtle: { textAlign: 'right', color: '#6B7280', marginTop: 2 },
  statusRight: {
    fontSize: 13,
    color: '#111827',
    marginTop: 2,
    textAlign: 'right',
  },

  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  socialBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },

  infoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoBlock: { marginBottom: 8 },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: { fontSize: 16, color: '#111827' },

  sectionTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: '#111827',
    marginTop: 6,
    marginBottom: 4,
  },

  affBlock: { marginTop: 4, marginBottom: 6 },
  affBlockTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  affBlockSubtitle: { fontSize: 12, color: '#6B7280', marginBottom: 6 },

  logoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 4,
  },
  logoCell: {
    width: '25%',
    paddingHorizontal: 6,
    marginBottom: 14,
    alignItems: 'center',
  },
  logoImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logoEmojiCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: { fontSize: 26 },
  logoCaption: {
    marginTop: 4,
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
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
