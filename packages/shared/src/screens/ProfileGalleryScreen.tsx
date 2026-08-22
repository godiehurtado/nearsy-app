/**
 * Profile gallery from the safe getDiscoveryProfile response (url only).
 * Never reads another users/{uid} document.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/HomeStack';
import { Ionicons } from '@expo/vector-icons';

import {
  buildGetDiscoveryProfileRequest,
  type DiscoveryGalleryItem,
} from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

type GalleryPhoto = { url: string };

export default function ProfileGalleryScreen() {
  type NavProp = NativeStackNavigationProp<
    HomeStackParamList,
    'ProfileGallery'
  >;
  type RouteProps = RouteProp<HomeStackParamList, 'ProfileGallery'>;

  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();

  const viewedUid = route.params?.uid;
  const paramUrls = route.params?.urls;
  const displayNameParam = route.params?.displayName;
  const routeMode = route.params?.mode;

  const [loading, setLoading] = useState(true);
  const [topColor] = useState('#3B5A85');
  const [firstName, setFirstName] = useState('Gallery');
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [resolvedMode, setResolvedMode] = useState<'personal' | 'professional'>(
    routeMode ?? 'personal',
  );

  const [viewerOpen, setViewerOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const insets = useSafeAreaInsets();

  const openViewer = useCallback((uri: string) => {
    setCurrent(uri);
    setViewerOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const apply = (
          urls: DiscoveryGalleryItem[] | GalleryPhoto[],
          name?: string,
          mode?: 'personal' | 'professional',
        ) => {
          if (cancelled) return;
          setPhotos(
            urls
              .map((item) => ({ url: item.url }))
              .filter((item) => typeof item.url === 'string' && !!item.url),
          );
          if (name) setFirstName(name);
          if (mode) setResolvedMode(mode);
        };

        if (paramUrls) {
          apply(paramUrls, displayNameParam, routeMode);
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
        apply(
          response.gallery,
          response.profile.displayName,
          response.profile.mode,
        );
      } catch (e) {
        if (__DEV__) console.error('[ProfileGallery] load error:', e);
        if (!cancelled) {
          setPhotos([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewedUid, paramUrls, displayNameParam, routeMode]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      <View style={[styles.topBar, { backgroundColor: topColor }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
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

        <View style={styles.topBtn} />
      </View>

      <Text style={styles.title}>
        {firstName}{' '}
        {resolvedMode === 'professional' ? 'Professional' : 'Personal'} Gallery
      </Text>

      {photos.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ color: '#6B7280' }}>No photos yet.</Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p, i) => p.url + i}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.thumbWrap}
              activeOpacity={0.9}
              onPress={() => openViewer(item.url)}
              accessibilityRole="button"
              accessibilityLabel="Photo"
            >
              <Image source={{ uri: item.url }} style={styles.thumb} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 6 }}
        />
      )}

      <Modal visible={viewerOpen} transparent animationType="fade">
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerOpen(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          {current ? (
            <Image
              source={{ uri: current }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const GAP = 6;
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    height: 60,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 16,
  },
  thumbWrap: {
    flex: 1 / 3,
    aspectRatio: 1,
    padding: GAP / 2,
  },
  thumb: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 2,
  },
  viewerImage: {
    width: '100%',
    height: '80%',
  },
});
