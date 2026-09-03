/**
 * Profile Exploration — Discovery Profile Detail.
 * Candidate data: getDiscoveryProfile only (no peer users/{uid} read).
 * Viewer onboarding interests: owner users/{me} snapshot only.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { doc, onSnapshot } from 'firebase/firestore';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import { InterestChip } from '../components/InterestChip';
import { MVP_FREE_SHOW_PROFILE_CONNECT_CTA } from '../product/mvpFreePresentation';
import { DiscoveryAffiliationsCard } from '../components/profileExploration/DiscoveryAffiliationsCard';
import { DiscoveryCompatibilityCard } from '../components/profileExploration/DiscoveryCompatibilityCard';
import { DiscoverySocialMediaRow } from '../components/profileExploration/DiscoverySocialMediaRow';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../theme';
import { cardShadow } from '../theme/shadows';
import {
  buildGetDiscoveryProfileRequest,
  galleryPreviewOverflowCount,
  galleryPreviewUrls,
  isVisibilityDiscoveryClientError,
  metersToFeet,
  resolveDistanceDisplayUnit,
  shouldShowGalleryPreviewOverflow,
  type GetDiscoveryProfileResponse,
  type ProfileMode,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import { blockCandidateUser } from '../visibility/blockCandidate';
import {
  extractViewerOnboardingInterestIds,
  intersectOnboardingInterestIds,
  resolveSharedInterestPills,
  shouldShowBio,
  shouldShowCompany,
  shouldShowOccupation,
  type ViewerProfileExplorationDoc,
} from '../visibility/profileExploration';

const HERO_HEIGHT = Math.min(Dimensions.get('window').height * 0.42, 360);

export default function DiscoveryProfileScreen() {
  const route = useRoute<
    | RouteProp<HomeStackParamList, 'DiscoveryProfile'>
    | RouteProp<HomeStackParamList, 'ProfileDetail'>
  >();
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const insets = useSafeAreaInsets();
  const { palette, theme } = useAppTheme();
  const { t } = useTranslation();
  const uid = route.params?.uid;
  const unit = resolveDistanceDisplayUnit(
    Localization.getLocales()?.[0]?.languageTag,
  );

  const [loading, setLoading] = useState(true);
  const [errorKind, setErrorKind] = useState<
    'none' | 'missing' | 'unavailable' | 'load'
  >('none');
  const [data, setData] = useState<GetDiscoveryProfileResponse | null>(null);
  const [viewerDoc, setViewerDoc] = useState<ViewerProfileExplorationDoc>({});
  const [heroFailed, setHeroFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState<Record<number, boolean>>(
    {},
  );
  const [previewLoaded, setPreviewLoaded] = useState<Record<number, boolean>>(
    {},
  );
  const [blockModal, setBlockModal] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const blockInFlight = useRef(false);

  const translateItem = useCallback(
    (nameKey: string, fallback: string) =>
      t(`onboarding.profileCompletion.interests.items.${nameKey}` as any, {
        defaultValue: fallback,
      }),
    [t],
  );

  useEffect(() => {
    const myUid = firebaseAuth.currentUser?.uid;
    if (!myUid) return;
    const unsub = onSnapshot(doc(firestoreDb, 'users', myUid), (snap) => {
      if (snap.exists()) {
        setViewerDoc((snap.data() as ViewerProfileExplorationDoc) ?? {});
      }
    });
    return () => unsub();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!uid) {
      setErrorKind('missing');
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorKind('none');
    setHeroFailed(false);
    try {
      const client = await getVisibilityDiscoveryClient();
      const response = await client.getDiscoveryProfile(
        buildGetDiscoveryProfileRequest(uid),
      );
      setData(response);
    } catch (err) {
      setData(null);
      if (
        isVisibilityDiscoveryClientError(err) &&
        err.reason.kind === 'known'
      ) {
        setErrorKind('unavailable');
      } else {
        setErrorKind('load');
      }
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const viewerInterestIds = useMemo(
    () => extractViewerOnboardingInterestIds(viewerDoc),
    [viewerDoc],
  );

  const sharedIds = useMemo(() => {
    if (!data) return [];
    return intersectOnboardingInterestIds(
      viewerInterestIds,
      data.profile.interestIds,
    );
  }, [data, viewerInterestIds]);

  const sharedPills = useMemo(
    () => resolveSharedInterestPills(sharedIds, translateItem),
    [sharedIds, translateItem],
  );

  const modeLabel = useMemo(() => {
    if (!data) return '';
    return data.profile.mode === 'professional'
      ? t('discoveryProfile.modeProfessional')
      : t('discoveryProfile.modePersonal');
  }, [data, t]);

  const distanceLabel = useMemo(() => {
    if (!data) return '';
    const value =
      unit === 'ft'
        ? Math.round(metersToFeet(data.distanceMeters))
        : Math.round(data.distanceMeters);
    return unit === 'ft'
      ? t('discoveryProfile.distanceAwayFt', { value })
      : t('discoveryProfile.distanceAwayM', { value });
  }, [data, t, unit]);

  const previewGallery = useMemo(
    () => (data ? galleryPreviewUrls(data.gallery, 3) : []),
    [data],
  );

  const showComingSoon = useCallback(() => {
    Alert.alert(t('discoveryProfile.comingSoon'));
  }, [t]);

  const onConfirmBlock = useCallback(async () => {
    if (blockInFlight.current || !uid) return;
    const myUid = firebaseAuth.currentUser?.uid;
    if (!myUid) {
      setBlockError(t('discoveryProfile.blockError'));
      return;
    }
    blockInFlight.current = true;
    setBlocking(true);
    setBlockError(null);
    const result = await blockCandidateUser({ myUid, candidateUid: uid });
    setBlocking(false);
    blockInFlight.current = false;
    if (!result.ok) {
      setBlockError(t('discoveryProfile.blockError'));
      return;
    }
    setBlockModal(false);
    navigation.goBack();
  }, [navigation, t, uid]);

  const openGallery = useCallback(
    (initialIndex = 0) => {
      if (!data || !uid || data.gallery.length === 0) return;
      navigation.navigate('ProfileGallery', {
        uid,
        urls: data.gallery,
        displayName: data.profile.displayName,
        mode: data.profile.mode,
        initialIndex,
      });
    },
    [data, navigation, uid],
  );

  if (loading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: palette.background, paddingTop: insets.top },
        ]}
      >
        <StatusBar
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        />
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={{ color: palette.textMuted, marginTop: spacing.md }}>
          {t('discoveryProfile.loading')}
        </Text>
      </View>
    );
  }

  if (errorKind !== 'none' || !data) {
    const message =
      errorKind === 'missing'
        ? t('discoveryProfile.missing')
        : errorKind === 'unavailable'
          ? t('discoveryProfile.unavailable')
          : t('discoveryProfile.loadError');
    return (
      <View
        style={[
          styles.flex,
          { backgroundColor: palette.background, paddingTop: insets.top },
        ]}
      >
        <StatusBar
          barStyle={theme === 'dark' ? 'light-content' : 'dark-content'}
        />
        <View style={styles.errorHeader}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('discoveryProfile.a11yBack')}
            style={[
              styles.backCircle,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            hitSlop={10}
          >
            <Ionicons
              name="chevron-back"
              size={22}
              color={palette.textPrimary}
            />
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={{ color: palette.textMuted, textAlign: 'center' }}>
            {message}
          </Text>
          {errorKind === 'load' ? (
            <Pressable
              onPress={() => void loadProfile()}
              style={[styles.retryBtn, { backgroundColor: palette.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('discoveryProfile.retry')}
            >
              <Text style={styles.retryText}>{t('discoveryProfile.retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const profile = data.profile;
  const mode = profile.mode as ProfileMode;
  const showOccupation = shouldShowOccupation(profile.occupation);
  const showCompany = shouldShowCompany(mode, profile.company);
  const showBio = shouldShowBio(profile.bio);
  const heroUri =
    !heroFailed && profile.profileImage ? profile.profileImage : null;
  // 3. Social Media — omitted when parsed socialLinks is empty.
  const publicSocialLinks = data.socialLinks;

  return (
    <View style={[styles.flex, { backgroundColor: palette.background }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        bounces
      >
        <View style={styles.heroWrap}>
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={styles.heroImage}
              onError={() => setHeroFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={[
                styles.heroImage,
                styles.heroFallback,
                { backgroundColor: palette.chipBg },
              ]}
            >
              <Ionicons
                name="person"
                size={64}
                color={palette.textMuted}
              />
            </View>
          )}
          <View style={styles.heroScrim} />
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('discoveryProfile.a11yBack')}
            style={[
              styles.heroBack,
              { top: insets.top + spacing.sm },
            ]}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.xl }}>
          {/* 2. Identity — name, profile type, distance (age is private) */}
          <Text
            style={[styles.name, { color: palette.textPrimary }]}
            accessibilityRole="header"
          >
            {profile.displayName}
          </Text>
          <Text
            style={[
              styles.metaSecondary,
              { color: palette.textSecondary, marginTop: 4 },
            ]}
          >
            {modeLabel}
          </Text>
          <Text
            style={{
              color: palette.textMuted,
              marginTop: spacing.xs,
              fontSize: fontSize.sm,
            }}
          >
            {distanceLabel}
          </Text>

          {/* 3. Social Media — omitted when DTO has no public links */}
          <DiscoverySocialMediaRow links={publicSocialLinks} />

          {/* 4. Compatibility — backend score when available */}
          <DiscoveryCompatibilityCard compatibility={data.compatibility} />

          {/* 5. Profile information + shared interests */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
              cardShadow,
            ]}
          >
            {showOccupation ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: palette.textMuted }]}
                >
                  {t('discoveryProfile.occupation')}
                </Text>
                <Text
                  style={{
                    color: palette.textPrimary,
                    marginTop: 5,
                    fontWeight: fontWeight.semibold,
                    fontSize: fontSize.md,
                    lineHeight: 22,
                  }}
                >
                  {profile.occupation.trim()}
                </Text>
              </>
            ) : null}

            {showCompany ? (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    {
                      color: palette.textMuted,
                      marginTop: showOccupation ? spacing.lg : 0,
                    },
                  ]}
                >
                  {t('discoveryProfile.company')}
                </Text>
                <Text
                  style={{
                    color: palette.textPrimary,
                    marginTop: 5,
                    fontWeight: fontWeight.semibold,
                    fontSize: fontSize.md,
                  }}
                >
                  {profile.company.trim()}
                </Text>
              </>
            ) : null}

            {showBio ? (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    {
                      color: palette.textMuted,
                      marginTop:
                        showOccupation || showCompany ? spacing.lg : 0,
                    },
                  ]}
                >
                  {t('discoveryProfile.biography')}
                </Text>
                <Text
                  style={{
                    color: palette.textSecondary,
                    marginTop: 5,
                    fontSize: fontSize.base,
                    lineHeight: 22,
                  }}
                >
                  {profile.bio.trim()}
                </Text>
              </>
            ) : null}

            <Text
              style={[
                styles.sectionLabel,
                {
                  color: palette.textMuted,
                  marginTop:
                    showOccupation || showCompany || showBio
                      ? spacing.lg
                      : 0,
                },
              ]}
            >
              {t('discoveryProfile.sharedInterests')}
            </Text>
            {sharedPills.length > 0 ? (
              <View style={styles.pillsRow}>
                {sharedPills.map((chip) => (
                  <InterestChip
                    key={chip.id}
                    name={chip.label}
                    icon={chip.icon}
                    iconColor={chip.iconColor}
                    selected={false}
                  />
                ))}
              </View>
            ) : (
              <Text
                style={{
                  color: palette.textSecondary,
                  marginTop: spacing.sm,
                  fontSize: fontSize.sm,
                  lineHeight: 20,
                }}
              >
                {t('discoveryProfile.noSharedInterests')}
              </Text>
            )}
          </View>

          {/* Affiliations — between Information and Photos; omitted when empty */}
          <DiscoveryAffiliationsCard affiliations={data.affiliations} />

          {/* 6. Photos */}
          <View style={styles.photosHeader}>
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
              {t('discoveryProfile.photos')}
            </Text>
            {data.gallery.length > 0 ? (
              <Pressable
                onPress={() => openGallery(0)}
                accessibilityRole="button"
                accessibilityLabel={t('discoveryProfile.a11yViewAllPhotos')}
              >
                <Text
                  style={{
                    color: palette.primary,
                    fontWeight: fontWeight.bold,
                    fontSize: fontSize.sm,
                  }}
                >
                  {t('discoveryProfile.viewAll')}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {previewGallery.length === 0 ? (
            <Text
              style={{
                color: palette.textMuted,
                marginTop: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              {t('discoveryProfile.galleryEmpty')}
            </Text>
          ) : (
            <View style={styles.previewRow}>
              {previewGallery.map((g, index) => {
                const showOverflow = shouldShowGalleryPreviewOverflow(
                  data.gallery.length,
                  index,
                  3,
                );
                const overflow = galleryPreviewOverflowCount(
                  data.gallery.length,
                  3,
                );
                const failed = !!previewFailed[index];
                const loaded = !!previewLoaded[index];
                return (
                  <Pressable
                    key={`${g.url}-${index}`}
                    onPress={() => openGallery(index)}
                    style={[
                      styles.previewTile,
                      { backgroundColor: palette.chipBg },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showOverflow
                        ? t('discoveryProfile.a11yPhotoOverflow', {
                            count: overflow,
                          })
                        : t('discoveryProfile.a11yPhoto')
                    }
                  >
                    {!failed ? (
                      <Image
                        source={{ uri: g.url }}
                        style={styles.previewImg}
                        onLoad={() =>
                          setPreviewLoaded((prev) => ({
                            ...prev,
                            [index]: true,
                          }))
                        }
                        onError={() =>
                          setPreviewFailed((prev) => ({
                            ...prev,
                            [index]: true,
                          }))
                        }
                      />
                    ) : (
                      <View style={styles.previewFallback}>
                        <Ionicons
                          name="image-outline"
                          size={22}
                          color={palette.textMuted}
                        />
                      </View>
                    )}
                    {!failed && !loaded ? (
                      <View style={styles.previewLoading}>
                        <ActivityIndicator
                          size="small"
                          color={palette.primary}
                        />
                      </View>
                    ) : null}
                    {showOverflow ? (
                      <View style={styles.overflowScrim}>
                        <Text style={styles.overflowText}>+{overflow}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          {MVP_FREE_SHOW_PROFILE_CONNECT_CTA ? (
            <Pressable
              onPress={showComingSoon}
              accessibilityRole="button"
              accessibilityLabel={t('discoveryProfile.a11yConnect')}
              style={[styles.connectBtn, { backgroundColor: palette.primary }]}
            >
              <Text style={styles.connectText}>
                {t('discoveryProfile.requestToConnect')}
              </Text>
            </Pressable>
          ) : null}

          {/* Report / Block */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={showComingSoon}
              accessibilityRole="button"
              accessibilityLabel={t('discoveryProfile.a11yReport')}
              style={[
                styles.secondaryAction,
                {
                  borderColor: '#F0D6CC',
                  backgroundColor: theme === 'dark' ? '#3A2A24' : '#FCF1EC',
                },
              ]}
            >
              <Ionicons name="flag-outline" size={16} color="#C2673E" />
              <Text style={{ color: '#C2673E', fontWeight: fontWeight.bold }}>
                {t('discoveryProfile.report')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setBlockError(null);
                setBlockModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('discoveryProfile.a11yBlock')}
              style={[
                styles.secondaryAction,
                {
                  borderColor: palette.danger,
                  backgroundColor: palette.dangerBg,
                },
              ]}
            >
              <Ionicons
                name="ban-outline"
                size={16}
                color={palette.danger}
              />
              <Text
                style={{ color: palette.danger, fontWeight: fontWeight.bold }}
              >
                {t('discoveryProfile.block')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={blockModal}
        transparent
        animationType="fade"
        onRequestClose={() => !blocking && setBlockModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <Text
              style={{
                color: palette.textPrimary,
                fontWeight: fontWeight.extrabold,
                fontSize: fontSize.lg,
              }}
            >
              {t('discoveryProfile.blockConfirmTitle', {
                name: profile.displayName,
              })}
            </Text>
            <Text
              style={{
                color: palette.textSecondary,
                marginTop: spacing.sm,
                lineHeight: 20,
              }}
            >
              {t('discoveryProfile.blockConfirmBody')}
            </Text>
            {blockError ? (
              <Text
                style={{
                  color: palette.danger,
                  marginTop: spacing.sm,
                }}
              >
                {blockError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                disabled={blocking}
                onPress={() => setBlockModal(false)}
                accessibilityRole="button"
                accessibilityLabel={t('discoveryProfile.cancel')}
                style={[
                  styles.modalBtn,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.panel,
                  },
                ]}
              >
                <Text
                  style={{
                    color: palette.textPrimary,
                    fontWeight: fontWeight.bold,
                  }}
                >
                  {t('discoveryProfile.cancel')}
                </Text>
              </Pressable>
              <Pressable
                disabled={blocking}
                onPress={() => void onConfirmBlock()}
                accessibilityRole="button"
                accessibilityLabel={t('discoveryProfile.blockConfirmAction')}
                style={[
                  styles.modalBtn,
                  { backgroundColor: palette.danger },
                ]}
              >
                {blocking ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.connectText}>
                    {t('discoveryProfile.blockConfirmAction')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    width: '100%',
    height: HERO_HEIGHT,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,32,61,0.22)',
  },
  heroBack: {
    position: 'absolute',
    left: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(18,32,61,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  name: {
    fontSize: 24,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
  },
  metaSecondary: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  age: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  compatTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photosHeader: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  previewTile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E2E7F0',
  },
  previewFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,32,61,0.08)',
  },
  overflowScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,32,61,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.md,
  },
  connectBtn: {
    marginTop: spacing.xl,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  connectText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
  },
});
