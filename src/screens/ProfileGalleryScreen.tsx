// src/screens/ProfileGalleryScreen.tsx
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
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

type Params = { uid: string; mode?: 'personal' | 'professional' };

type GalleryPhoto = {
  url: string;
  path?: string;
  createdAt?: number;
};

type ProfileDoc = {
  realName?: string;
  topBarColor?: string;
  mode?: 'personal' | 'professional';

  // NUEVO esquema por modo:
  personalGallery?: GalleryPhoto[] | string[];
  professionalGallery?: GalleryPhoto[] | string[];

  // LEGACY (por si hay restos)
  photos?: GalleryPhoto[] | string[];
};

function deriveFirstName(real?: string) {
  const rn = (real || '').trim();
  if (!rn) return 'Unnamed';
  const [first] = rn.split(/\s+/);
  return `${first}'s`;
}

function normalizePhotos(input?: GalleryPhoto[] | string[]) {
  if (!Array.isArray(input)) return [];
  if (input.length > 0 && typeof input[0] === 'string') {
    return (input as string[]).filter(Boolean).map((url) => ({ url }));
  }
  return (input as GalleryPhoto[]).filter((p) => !!p?.url);
}

export default function ProfileGalleryScreen() {
  const route = useRoute<RouteProp<Record<string, Params>, string>>();
  const navigation = useNavigation();
  const viewedUid = route.params?.uid;
  const routeMode = route.params?.mode;

  const [loading, setLoading] = useState(true);
  const [topColor, setTopColor] = useState('#3B5A85');
  const [firstName, setFirstName] = useState('Unnamed');
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [resolvedMode, setResolvedMode] = useState<'personal' | 'professional'>(
    'personal',
  );

  const [viewerOpen, setViewerOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const insets = useSafeAreaInsets();

  const openViewer = useCallback((uri: string) => {
    setCurrent(uri);
    setViewerOpen(true);
  }, []);

  // Carga del perfil consultado
  useEffect(() => {
    (async () => {
      try {
        if (!viewedUid) return;
        const snap = await getDoc(doc(firestore, 'users', viewedUid));
        if (snap.exists()) {
          const data = snap.data() as ProfileDoc;

          // 1) nombre y color del perfil visto
          setFirstName(deriveFirstName(data.realName));
          setTopColor(data.topBarColor ?? '#3B5A85');

          // 2) modo a usar: el que pasó la ruta, o el guardado en el doc, o 'personal'
          const mode: 'personal' | 'professional' =
            routeMode ?? data.mode ?? 'personal';
          setResolvedMode(mode);

          // 3) fotos según modo (con fallback legacy si hiciera falta)
          const list =
            mode === 'professional'
              ? normalizePhotos(data.professionalGallery)
              : normalizePhotos(data.personalGallery);

          const finalList =
            list.length > 0 ? list : normalizePhotos(data.photos); // fallback suave

          setPhotos(finalList);
        } else {
          setFirstName('Unnamed');
          setPhotos([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [viewedUid, routeMode]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2B3A42" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      {/* Top bar con logo + texto centrado */}
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
          keyExtractor={(p, i) => (p.path || p.url) + i}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.thumbWrap}
              activeOpacity={0.9}
              onPress={() => openViewer(item.url)}
            >
              <Image source={{ uri: item.url }} style={styles.thumb} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 6 }}
        />
      )}

      {/* Visor fullscreen */}
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
    flex: 1 / 3, // 3 por fila
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
