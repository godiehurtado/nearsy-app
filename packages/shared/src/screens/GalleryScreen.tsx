// src/screens/GalleryScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Animated,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import {
  firestoreDb,
  firebaseAuth,
  storageWeb,
} from '../config/firebaseConfig';

import { GalleryPhoto } from '../types/profile';
import { uploadGalleryImage } from '../services/storageService';
import TopHeader from '../components/TopHeader';
import { MAX_GALLERY_ITEMS } from '../visibility/constants';
import {
  GALLERY_GRID_GAP,
  GALLERY_TILE_RADIUS,
  OWN_PROFILE_GALLERY_COLUMNS,
  galleryTileSize,
} from '../gallery/galleryGridTokens';
import {
  buildPostCrjGalleryPersistencePatch,
  prependGalleryPhoto,
  readPostCrjGalleryFromDoc,
  removeGalleryPhoto as removeGalleryPhotoFromList,
} from '../gallery/postCrjGalleryEditor';

type ProfileMode = 'personal' | 'professional';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const ITEM_GAP = GALLERY_GRID_GAP;
const ITEM_SIZE = galleryTileSize(
  SCREEN_WIDTH,
  OWN_PROFILE_GALLERY_COLUMNS,
  GRID_PADDING * 2,
);

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

export default function GalleryScreen({ route, navigation }: any) {
  const { uid: routeUid, mode: routeMode } = (route?.params ||
    {}) as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [isOwn, setIsOwn] = useState<boolean>(true);
  const [mode, setMode] = useState<ProfileMode>(
    routeMode === 'professional' ? 'professional' : 'personal',
  );

  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [lastAddedPhotoKey, setLastAddedPhotoKey] = useState<string | null>(
    null,
  );

  const atGalleryCap = photos.length >= MAX_GALLERY_ITEMS;

  useEffect(() => {
    (async () => {
      try {
        const myUid = firebaseAuth.currentUser?.uid ?? null;
        const targetUid = routeUid ?? myUid ?? null;

        if (!targetUid) throw new Error('User not authenticated.');

        setOwnerUid(targetUid);
        setIsOwn(!!myUid && myUid === targetUid);

        const effectiveRouteMode: ProfileMode =
          routeMode === 'professional' ? 'professional' : 'personal';

        const snap = await firestoreDb.collection('users').doc(targetUid).get();

        const exists =
          typeof snap.exists === 'function' ? snap.exists() : snap.exists;
        if (!exists) {
          setTopBarColor('#3B5A85');
          setTopBarMode('color');
          setTopBarImage(null);
          setProfileImage(null);
          setMode(effectiveRouteMode);
          setPhotos([]);
          return;
        }

        const data = snap.data() as any;

        setTopBarColor(data?.topBarColor || '#3B5A85');
        setTopBarMode(
          data?.topBarMode || (data?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage(data?.topBarImage || null);
        setProfileImage(data?.profileImage || null);

        const effectiveMode: ProfileMode =
          routeMode === 'professional' || routeMode === 'personal'
            ? routeMode
            : data?.mode === 'professional'
              ? 'professional'
              : 'personal';

        setMode(effectiveMode);

        setPhotos(readPostCrjGalleryFromDoc(data as Record<string, unknown>, effectiveMode));
      } catch (e: any) {
        if (__DEV__) {
          console.error('[GalleryScreen] Error loading gallery', e);
        }

        setTopBarColor('#3B5A85');
        setTopBarMode('color');
        setTopBarImage(null);
        setProfileImage(null);
        setPhotos([]);

        Alert.alert('Error', e?.message || 'Could not load gallery.');
      } finally {
        setLoading(false);
      }
    })();
  }, [routeUid, routeMode]);

  const openViewer = (uri: string) => {
    setCurrent(uri);
    setViewerOpen(true);
  };

  const animateNewPhoto = (photoKey: string) => {
    fadeAnim.setValue(0);
    setLastAddedPhotoKey(photoKey);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  };

  const handleAddPhoto = async () => {
    try {
      if (!isOwn || !ownerUid) return;

      if (photos.length >= MAX_GALLERY_ITEMS) {
        Alert.alert(
          'Gallery full',
          `You can add up to ${MAX_GALLERY_ITEMS} photos.`,
        );
        return;
      }

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        Alert.alert('Permission required', 'We need access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || result.assets.length === 0) return;

      setSaving(true);

      const asset = result.assets[0];

      const localPhoto: GalleryPhoto = {
        url: asset.uri,
        path: `local-${Date.now()}`,
        createdAt: Date.now(),
      };

      const localPhotoKey = localPhoto.path || localPhoto.url;

      animateNewPhoto(localPhotoKey);

      const optimisticPhotos = prependGalleryPhoto(photos, localPhoto).slice(
        0,
        MAX_GALLERY_ITEMS,
      );
      setPhotos(optimisticPhotos);

      const { url, path } = await uploadGalleryImage(ownerUid, asset.uri, mode);

      const uploadedPhoto: GalleryPhoto = {
        url,
        path,
        createdAt: localPhoto.createdAt,
      };

      const finalPhotos = optimisticPhotos.map((p) =>
        p.path === localPhoto.path ? uploadedPhoto : p,
      );

      const patch = buildPostCrjGalleryPersistencePatch(mode, finalPhotos);
      await firestoreDb
        .collection('users')
        .doc(ownerUid)
        .set(
          {
            ...patch,
            updatedAt: Date.now(),
          },
          { merge: true },
        );

      setPhotos(finalPhotos);
      setLastAddedPhotoKey(uploadedPhoto.path || uploadedPhoto.url);
    } catch (e: any) {
      if (__DEV__) {
        console.error('[GalleryScreen] Error adding photo', e);
      }

      Alert.alert('Error', e?.message || 'Could not add photo.');
      setPhotos((prev) => prev.filter((p) => !p.path?.startsWith('local-')));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async (photo: GalleryPhoto) => {
    try {
      if (!isOwn || !ownerUid) return;

      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Delete photo',
          'Are you sure you want to delete this photo?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ],
        );
      });

      if (!confirmed) return;

      setSaving(true);

      if (photo.path && !photo.path.startsWith('local-')) {
        try {
          await (storageWeb as any).ref(photo.path).delete();
        } catch (e) {
          if (__DEV__) {
            console.warn('[GalleryScreen] Could not delete storage object', e);
          }
        }
      }

      const next = removeGalleryPhotoFromList(photos, photo);

      const patch = buildPostCrjGalleryPersistencePatch(mode, next);
      await firestoreDb
        .collection('users')
        .doc(ownerUid)
        .set(
          {
            ...patch,
            updatedAt: Date.now(),
          },
          { merge: true },
        );

      setPhotos(next);

      if (current && current === photo.url) {
        setViewerOpen(false);
        setCurrent(null);
      }
    } catch (e: any) {
      if (__DEV__) {
        console.error('[GalleryScreen] Error deleting photo', e);
      }

      Alert.alert('Error', e?.message || 'Could not delete photo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      <TopHeader
        topBarMode={topBarMode}
        topBarColor={topBarColor}
        topBarImage={topBarImage}
        profileImage={profileImage}
        leftIcon="chevron-back"
        onLeftPress={() => navigation.goBack()}
        showAvatar
      />

      <Text style={styles.title}>
        {isOwn ? 'Your Gallery' : 'Gallery'} ·{' '}
        {mode === 'personal' ? 'Personal' : 'Professional'}
        {isOwn ? ` · ${photos.length}/${MAX_GALLERY_ITEMS}` : ''}
      </Text>

      <View style={styles.grid}>
        {isOwn && !atGalleryCap && (
          <TouchableOpacity
            style={styles.addItem}
            onPress={handleAddPhoto}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#3B5A85" />
            ) : (
              <Ionicons name="add" size={34} color="#3B5A85" />
            )}
          </TouchableOpacity>
        )}

        {photos.map((p, i) => {
          const photoKey = p.path || p.url;
          const isNewPhoto = photoKey === lastAddedPhotoKey;

          if (isNewPhoto) {
            return (
              <Animated.View
                key={photoKey + i}
                style={[
                  styles.gridItemWrap,
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        scale: fadeAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.92, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.9}
                  onPress={() => openViewer(p.url)}
                  onLongPress={() => isOwn && handleDeletePhoto(p)}
                >
                  <Image source={{ uri: p.url }} style={styles.gridItem} />
                </TouchableOpacity>
              </Animated.View>
            );
          }

          return (
            <TouchableOpacity
              key={photoKey + i}
              style={styles.gridItemWrap}
              activeOpacity={0.9}
              onPress={() => openViewer(p.url)}
              onLongPress={() => isOwn && handleDeletePhoto(p)}
            >
              <Image source={{ uri: p.url }} style={styles.gridItem} />
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal visible={viewerOpen} transparent animationType="fade">
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerOpen(false)}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>

          {current && (
            <Image
              source={{ uri: current }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingHorizontal: GRID_PADDING,
    columnGap: ITEM_GAP,
    rowGap: ITEM_GAP,
  },

  gridItemWrap: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: GALLERY_TILE_RADIUS,
    position: 'relative',
  },

  addItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: GALLERY_TILE_RADIUS,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },

  gridItem: {
    width: '100%',
    height: '100%',
    borderRadius: GALLERY_TILE_RADIUS,
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
