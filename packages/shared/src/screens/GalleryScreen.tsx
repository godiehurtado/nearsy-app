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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

import { GalleryPhoto } from '../types/profile';
import { uploadGalleryImage } from '../services/storageService';
import TopHeader from '../components/TopHeader';
import { buildGetDiscoveryProfileRequest } from '../visibility';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';

type ProfileMode = 'personal' | 'professional';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 16;
const ITEM_GAP = 10;
const ITEM_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - ITEM_GAP * 2) / 3;

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

  const fieldName =
    mode === 'personal' ? 'personalGallery' : 'professionalGallery';

  useEffect(() => {
    (async () => {
      try {
        const myUid = firebaseAuth.currentUser?.uid ?? null;
        const targetUid = routeUid ?? myUid ?? null;

        if (!targetUid) throw new Error('User not authenticated.');

        setOwnerUid(targetUid);
        const own = !!myUid && myUid === targetUid;
        setIsOwn(own);

        const effectiveRouteMode: ProfileMode =
          routeMode === 'professional' ? 'professional' : 'personal';

        if (!own) {
          const client = await getVisibilityDiscoveryClient();
          const response = await client.getDiscoveryProfile(
            buildGetDiscoveryProfileRequest(targetUid),
          );
          setTopBarColor('#3B5A85');
          setTopBarMode('color');
          setTopBarImage(null);
          setProfileImage(response.profile.profileImage);
          setMode(response.profile.mode);
          setPhotos(
            response.gallery
              .filter((p) => !!p?.url)
              .map((p) => ({ url: p.url, path: '', createdAt: 0 })),
          );
          return;
        }

        const snap = await getDoc(doc(firestoreDb, 'users', targetUid));

        if (!snap.exists()) {
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

        const raw =
          effectiveMode === 'personal'
            ? data?.personalGallery
            : data?.professionalGallery;

        const list: GalleryPhoto[] = Array.isArray(raw)
          ? raw.filter((p) => !!p?.url)
          : [];

        setPhotos(list);
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

      const optimisticPhotos = [localPhoto, ...photos];
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

      await setDoc(
        doc(firestoreDb, 'users', ownerUid),
        {
          [fieldName]: finalPhotos,
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
          await deleteObject(ref(storageWeb, photo.path));
        } catch (e) {
          if (__DEV__) {
            console.warn('[GalleryScreen] Could not delete storage object', e);
          }
        }
      }

      const next = photos.filter(
        (p) => (p.path || p.url) !== (photo.path || photo.url),
      );

      await setDoc(
        doc(firestoreDb, 'users', ownerUid),
        {
          [fieldName]: next,
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
      </Text>

      <View style={styles.grid}>
        {isOwn && (
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
    borderRadius: 10,
    position: 'relative',
  },

  addItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 10,
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
