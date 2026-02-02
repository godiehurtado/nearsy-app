// src/screens/GalleryScreen.tsx  ✅ RNFirebase-only
import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { firestoreDb, firebaseAuth } from '../config/firebaseConfig';
import storage from '@react-native-firebase/storage';

import { GalleryPhoto } from '../types/profile';
import { uploadGalleryImage } from '../services/storageService';
import TopHeader from '../components/TopHeader';

type ProfileMode = 'personal' | 'professional';
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
  const [mode, setMode] = useState<ProfileMode>('personal');

  // Top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);

  // viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const myUid = firebaseAuth.currentUser?.uid ?? null;
        const targetUid = routeUid ?? myUid ?? null;
        if (!targetUid) throw new Error('User not authenticated.');

        setOwnerUid(targetUid);
        setIsOwn(!!myUid && myUid === targetUid);

        // ✅ RNFirebase Firestore get
        const snap = await firestoreDb.collection('users').doc(targetUid).get();
        if (snap.exists) {
          const data = snap.data() as any;

          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);

          const effectiveMode: ProfileMode =
            routeMode ?? data.mode ?? 'personal';
          setMode(effectiveMode);

          const raw =
            effectiveMode === 'personal'
              ? data.personalGallery
              : data.professionalGallery;

          const list: GalleryPhoto[] = Array.isArray(raw)
            ? (raw as GalleryPhoto[]).filter((p) => !!p?.url)
            : [];

          setPhotos(list);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load gallery.');
      } finally {
        setLoading(false);
      }
    })();
  }, [routeUid, routeMode]);

  const fieldName =
    mode === 'personal' ? 'personalGallery' : 'professionalGallery';

  const openViewer = (uri: string) => {
    setCurrent(uri);
    setViewerOpen(true);
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

      const { url, path } = await uploadGalleryImage(ownerUid, asset.uri, mode);
      const newPhoto: GalleryPhoto = { url, path, createdAt: Date.now() };

      const next = [newPhoto, ...photos];

      // ✅ RNFirebase Firestore set(merge)
      await firestoreDb
        .collection('users')
        .doc(ownerUid)
        .set({ [fieldName]: next, updatedAt: Date.now() }, { merge: true });

      setPhotos(next);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not add photo.');
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
          { cancelable: true },
        );
      });
      if (!confirmed) return;

      setSaving(true);

      // ✅ RNFirebase Storage delete
      if (photo.path) {
        try {
          await storage().ref(photo.path).delete();
        } catch {}
      }

      const next = photos.filter(
        (p) => (p.path || p.url) !== (photo.path || photo.url),
      );

      await firestoreDb
        .collection('users')
        .doc(ownerUid)
        .set({ [fieldName]: next, updatedAt: Date.now() }, { merge: true });

      setPhotos(next);

      if (current && current === photo.url) {
        setViewerOpen(false);
        setCurrent(null);
      }
    } catch (e: any) {
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
        rightIcon={isOwn ? 'add' : undefined}
        onRightPress={isOwn ? handleAddPhoto : undefined}
        rightDisabled={saving}
        rightLoading={saving}
        showAvatar
      />

      <Text style={styles.title}>
        {isOwn ? 'Your Gallery' : 'Gallery'} ·{' '}
        {mode === 'personal' ? 'Personal' : 'Professional'}
      </Text>

      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={(p.path || p.url) + i} style={styles.gridItemWrap}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => openViewer(p.url)}
              onLongPress={() => isOwn && handleDeletePhoto(p)}
            >
              <Image source={{ uri: p.url }} style={styles.gridItem} />
            </TouchableOpacity>

            {isOwn && (
              <TouchableOpacity
                style={styles.deleteBadge}
                onPress={() => handleDeletePhoto(p)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      <Modal visible={viewerOpen} transparent animationType="fade">
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewerOpen(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    gap: 10,
    paddingHorizontal: 16,
  },
  gridItemWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    position: 'relative',
  },
  gridItem: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  deleteBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerClose: { position: 'absolute', top: 40, right: 20, zIndex: 2 },
  viewerImage: { width: '100%', height: '80%' },
});
