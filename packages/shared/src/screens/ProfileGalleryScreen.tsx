/**
 * Profile Gallery viewer — getDiscoveryProfile URLs only (no peer users/{uid} read).
 * Dark Nearsy chrome: header + thumbnail rail, main photo with swipe / arrows.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import type { HomeStackParamList } from '../navigation/HomeStack';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../theme';
import {
  buildGetDiscoveryProfileRequest,
  clampGalleryIndex,
  nextGalleryIndex,
  prevGalleryIndex,
  type DiscoveryGalleryItem,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

type GalleryPhoto = { url: string };

/** Hosted on HomeStack (Discovery) and ProfileStack (Own Profile Gallery). */
type ProfileGalleryHostParamList = {
  ProfileGallery: HomeStackParamList['ProfileGallery'];
};

const GALLERY_DARK = '#0C1936';
const GALLERY_DARK_ALT = '#12203D';
const THUMB = 56;
const THUMB_GAP = 8;

export default function ProfileGalleryScreen() {
  type NavProp = NativeStackNavigationProp<
    ProfileGalleryHostParamList,
    'ProfileGallery'
  >;
  type RouteProps = RouteProp<ProfileGalleryHostParamList, 'ProfileGallery'>;

  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const windowWidth = Dimensions.get('window').width;

  const viewedUid = route.params?.uid;
  const paramUrls = route.params?.urls;
  const displayNameParam = route.params?.displayName;
  const routeInitial = route.params?.initialIndex ?? 0;
  const fullGallery = route.params?.fullGallery === true;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [displayName, setDisplayName] = useState(
    displayNameParam || t('discoveryProfile.title'),
  );
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});

  const mainRef = useRef<FlatList<GalleryPhoto>>(null);
  const thumbsRef = useRef<FlatList<GalleryPhoto>>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setLoadError(false);

        const apply = (
          urls: DiscoveryGalleryItem[] | GalleryPhoto[],
          name?: string,
        ) => {
          if (cancelled) return;
          const next = urls
            .map((item) => ({ url: item.url }))
            .filter((item) => typeof item.url === 'string' && !!item.url);
          const capped = fullGallery ? next : next.slice(0, 12);
          setPhotos(capped);
          setIndex(clampGalleryIndex(routeInitial, next.length));
          if (name) setDisplayName(name);
        };

        if (paramUrls) {
          apply(paramUrls, displayNameParam);
          return;
        }

        if (!viewedUid) {
          apply([]);
          return;
        }

        const client = await getVisibilityDiscoveryClient();
        const response = await client.getDiscoveryProfile(
          buildGetDiscoveryProfileRequest(viewedUid),
        );
        apply(response.gallery, response.profile.displayName);
      } catch {
        if (!cancelled) {
          setPhotos([]);
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewedUid, paramUrls, displayNameParam, routeInitial, fullGallery]);

  const goTo = useCallback(
    (next: number, animated = true) => {
      const clamped = clampGalleryIndex(next, photos.length);
      setIndex(clamped);
      mainRef.current?.scrollToIndex({ index: clamped, animated });
      thumbsRef.current?.scrollToIndex({
        index: clamped,
        animated: true,
        viewPosition: 0.5,
      });
    },
    [photos.length],
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = clampGalleryIndex(
        Math.round(x / Math.max(1, windowWidth)),
        photos.length,
      );
      setIndex(next);
      thumbsRef.current?.scrollToIndex({
        index: next,
        animated: true,
        viewPosition: 0.5,
      });
    },
    [photos.length, windowWidth],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (typeof first?.index === 'number') {
        setIndex(first.index);
      }
    },
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 60 }),
    [],
  );

  const prev = prevGalleryIndex(index, photos.length);
  const next = nextGalleryIndex(index, photos.length);
  const counter =
    photos.length > 0
      ? t('discoveryProfile.galleryCounter', {
          current: index + 1,
          total: photos.length,
        })
      : '';

  if (loading) {
    return (
      <View
        style={[
          styles.root,
          styles.center,
          { paddingTop: insets.top, backgroundColor: GALLERY_DARK },
        ]}
      >
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>{t('discoveryProfile.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: GALLERY_DARK }]}>
      <StatusBar barStyle="light-content" />

      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: GALLERY_DARK_ALT,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('discoveryProfile.a11yBack')}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {displayName}
          </Text>
          {photos.length > 0 ? (
            <Text style={styles.headerCounter}>{counter}</Text>
          ) : null}
        </View>
        <View style={styles.headerBtn} />
      </View>

      {loadError ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t('discoveryProfile.loadError')}</Text>
        </View>
      ) : photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{t('discoveryProfile.galleryEmpty')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.mainWrap}>
            <FlatList
              ref={mainRef}
              data={photos}
              keyExtractor={(item, i) => `${item.url}:${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={clampGalleryIndex(index, photos.length)}
              getItemLayout={(_, i) => ({
                length: windowWidth,
                offset: windowWidth * i,
                index: i,
              })}
              onMomentumScrollEnd={onMomentumEnd}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  mainRef.current?.scrollToIndex({
                    index: info.index,
                    animated: false,
                  });
                }, 50);
              }}
              renderItem={({ item, index: i }) => (
                <View
                  style={[
                    styles.slide,
                    { width: windowWidth, backgroundColor: GALLERY_DARK },
                  ]}
                >
                  {failed[i] ? (
                    <View style={styles.imageFallback}>
                      <Ionicons
                        name="image-outline"
                        size={40}
                        color="rgba(255,255,255,0.55)"
                      />
                      <Text style={styles.muted}>
                        {t('discoveryProfile.imageUnavailable')}
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Image
                        source={{ uri: item.url }}
                        style={styles.mainImage}
                        resizeMode="contain"
                        onLoad={() =>
                          setLoaded((prevMap) => ({ ...prevMap, [i]: true }))
                        }
                        onError={() =>
                          setFailed((prevMap) => ({ ...prevMap, [i]: true }))
                        }
                        accessibilityLabel={t('discoveryProfile.a11yPhoto')}
                      />
                      {!loaded[i] ? (
                        <View style={styles.imageLoading}>
                          <ActivityIndicator color="#FFFFFF" />
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            />

            {prev !== null ? (
              <Pressable
                onPress={() => goTo(prev)}
                style={[styles.navArrow, styles.navLeft]}
                accessibilityRole="button"
                accessibilityLabel={t('discoveryProfile.a11yPreviousPhoto')}
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </Pressable>
            ) : null}
            {next !== null ? (
              <Pressable
                onPress={() => goTo(next)}
                style={[styles.navArrow, styles.navRight]}
                accessibilityRole="button"
                accessibilityLabel={t('discoveryProfile.a11yNextPhoto')}
                hitSlop={8}
              >
                <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>

          <View
            style={[
              styles.thumbRail,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md),
                backgroundColor: GALLERY_DARK_ALT,
              },
            ]}
          >
            <FlatList
              ref={thumbsRef}
              data={photos}
              keyExtractor={(item, i) => `thumb:${item.url}:${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbContent}
              initialScrollIndex={clampGalleryIndex(index, photos.length)}
              getItemLayout={(_, i) => ({
                length: THUMB + THUMB_GAP,
                offset: (THUMB + THUMB_GAP) * i,
                index: i,
              })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index: i }) => {
                const active = i === index;
                return (
                  <Pressable
                    onPress={() => goTo(i)}
                    style={[
                      styles.thumb,
                      {
                        borderColor: active
                          ? palette.primaryLight
                          : 'transparent',
                        opacity: active ? 1 : 0.72,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('discoveryProfile.a11ySelectPhoto', {
                      index: i + 1,
                      total: photos.length,
                    })}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={styles.thumbImg}
                      resizeMode="cover"
                    />
                  </Pressable>
                );
              }}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.sm,
  },
  muted: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    minWidth: 0,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  headerCounter: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  mainWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  imageLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(18,32,61,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: spacing.md },
  navRight: { right: spacing.md },
  thumbRail: {
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  thumbContent: {
    paddingHorizontal: spacing.lg,
    gap: THUMB_GAP,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    marginRight: THUMB_GAP,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
