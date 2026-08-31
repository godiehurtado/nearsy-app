import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firebaseAuth } from '../config/firebaseConfig';
import { getUserProfile, updateUserProfilePartial } from '../services/firestoreService';
import {
  deleteGalleryStorageObject,
  uploadGalleryImage,
} from '../services/storageService';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme/ThemeContext';
import { spacing, screenPadding } from '../theme/spacing';
import { fontSize, fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import type { GalleryPhoto } from '../types/profile';
import type { ProfileMode } from '../profile/profileModeFields';
import { ProfileGalleryAdminGrid } from '../components/gallery/ProfileGalleryAdminGrid';
import { OWN_PROFILE_GALLERY_COLUMNS } from '../gallery/galleryGridTokens';
import {
  buildPostCrjGalleryPersistencePatch,
  createGalleryOperationLock,
  parsePostCrjGalleryEditorParams,
  prependGalleryPhoto,
  readPostCrjGalleryFromDoc,
  removeGalleryPhoto,
} from '../gallery/postCrjGalleryEditor';

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type LoadState = 'loading' | 'ready' | 'error' | 'blocked';
type OperationKind = 'idle' | 'uploading' | 'deleting';

export default function GalleryScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { palette } = useAppTheme();

  const params = (route.params ?? {}) as RouteParams;
  const parsed = parsePostCrjGalleryEditorParams(
    params as Record<string, unknown>,
    firebaseAuth.currentUser?.uid ?? null,
  );

  const lockedModeRef = useRef<ProfileMode | null>(
    parsed.ok ? parsed.params.mode : null,
  );
  const lockedUidRef = useRef<string | null>(parsed.ok ? parsed.params.uid : null);
  const editorMode = lockedModeRef.current;
  const editorUid = lockedUidRef.current;
  const operationLockRef = useRef(createGalleryOperationLock());

  const [loadState, setLoadState] = useState<LoadState>(
    parsed.ok ? 'loading' : 'blocked',
  );
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [operationKind, setOperationKind] = useState<OperationKind>('idle');
  const [pendingPreviewUri, setPendingPreviewUri] = useState<string | null>(null);

  const photoCount = photos.length;
  const operationBusy = operationKind !== 'idle';

  const screenTitle =
    editorMode === 'professional'
      ? t('profile.gallery.professionalTitle')
      : t('profile.gallery.personalTitle');

  const countLabel =
    photoCount === 1
      ? t('profile.gallery.countOne')
      : t('profile.gallery.count', { count: photoCount });

  const beginOperation = useCallback((kind: OperationKind): boolean => {
    if (!operationLockRef.current.tryAcquire()) return false;
    setOperationKind(kind);
    return true;
  }, []);

  const endOperation = useCallback(() => {
    operationLockRef.current.release();
    setOperationKind('idle');
    setPendingPreviewUri(null);
  }, []);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  useEffect(() => {
    if (!parsed.ok || !editorUid || !editorMode) {
      setLoadState('blocked');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadState('loading');
        const existing = await getUserProfile(editorUid);
        if (cancelled) return;

        if (!existing || existing.profileSetupCompleted !== true) {
          setLoadState('blocked');
          return;
        }

        setPhotos(
          readPostCrjGalleryFromDoc(existing as Record<string, unknown>, editorMode),
        );
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editorMode, editorUid, parsed.ok]);

  const persistGallery = useCallback(
    async (nextPhotos: GalleryPhoto[]) => {
      if (!editorUid || !editorMode) {
        throw new Error('Gallery editor unavailable');
      }
      const patch = buildPostCrjGalleryPersistencePatch(editorMode, nextPhotos);
      await updateUserProfilePartial(editorUid, patch);
      setPhotos(nextPhotos);
    },
    [editorMode, editorUid],
  );

  const openGalleryViewer = useCallback(
    (index: number) => {
      if (operationBusy || photos.length === 0) return;
      // Push on the same Profile stack so viewer Back returns to Gallery
      // (not cross-tab to Home, which left goBack on MainHome).
      navigation.navigate('ProfileGallery', {
        uid: editorUid,
        urls: photos.map((photo) => ({ url: photo.url })),
        displayName: screenTitle,
        initialIndex: index,
        fullGallery: true,
      });
    },
    [editorUid, navigation, operationBusy, photos, screenTitle],
  );

  const handleAddPhoto = useCallback(async () => {
    if (!editorUid || !editorMode || operationBusy) return;
    if (!beginOperation('uploading')) return;

    let uploadedPath: string | null = null;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          t('profile.gallery.permissionTitle'),
          t('profile.gallery.permissionBody'),
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0]!;
      setPendingPreviewUri(asset.uri);

      const uploaded = await uploadGalleryImage(editorUid, asset.uri, editorMode);
      uploadedPath = uploaded.path;

      const newPhoto: GalleryPhoto = {
        url: uploaded.url,
        path: uploaded.path,
        createdAt: Date.now(),
      };

      const nextPhotos = prependGalleryPhoto(photos, newPhoto);
      await persistGallery(nextPhotos);
    } catch (e: any) {
      if (uploadedPath) {
        await deleteGalleryStorageObject(uploadedPath);
      }
      Alert.alert(t('common.error'), e?.message || t('profile.gallery.uploadError'));
    } finally {
      endOperation();
    }
  }, [
    beginOperation,
    editorMode,
    editorUid,
    endOperation,
    operationBusy,
    persistGallery,
    photos,
    t,
  ]);

  const handleDeletePhoto = useCallback(
    (photo: GalleryPhoto) => {
      if (operationBusy) return;

      Alert.alert(
        t('profile.gallery.deleteTitle'),
        t('profile.gallery.deleteBody'),
        [
          { text: t('profile.gallery.cancel'), style: 'cancel' },
          {
            text: t('profile.gallery.delete'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                if (!beginOperation('deleting')) return;

                const previousPhotos = photos;
                const nextPhotos = removeGalleryPhoto(previousPhotos, photo);

                try {
                  await persistGallery(nextPhotos);
                  if (photo.path) {
                    await deleteGalleryStorageObject(photo.path);
                  }
                } catch (e: any) {
                  setPhotos(previousPhotos);
                  Alert.alert(
                    t('common.error'),
                    e?.message || t('profile.gallery.deleteError'),
                  );
                } finally {
                  endOperation();
                }
              })();
            },
          },
        ],
        { cancelable: true },
      );
    },
    [beginOperation, endOperation, operationBusy, persistGallery, photos, t],
  );

  if (!parsed.ok || loadState === 'blocked') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
          <Text style={[styles.messageText, { color: palette.textSecondary }]}>
            {t('profile.gallery.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.gallery.backA11y')}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.panel,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.gallery.backA11y')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loadState === 'loading') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View
          style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View style={[styles.root, { backgroundColor: palette.background }]}>
        <View style={[styles.centered, { paddingTop: insets.top + spacing.xl }]}>
          <Text
            accessibilityRole="alert"
            style={[styles.messageText, { color: palette.textSecondary }]}
          >
            {t('profile.gallery.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.gallery.backA11y')}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                borderColor: palette.borderStrong,
                backgroundColor: palette.panel,
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.backBtnText, { color: palette.textPrimary }]}>
              {t('profile.gallery.backA11y')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: screenPadding.horizontal,
        }}
        scrollIndicatorInsets={{ top: insets.top }}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.gallery.backA11y')}
            onPress={handleBack}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerBack,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
              },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
          </Pressable>

          <View style={styles.headerTextCol}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.textPrimary }]}
            >
              {screenTitle}
            </Text>
            <Text
              accessibilityLabel={countLabel}
              style={[styles.countText, { color: palette.textSecondary }]}
            >
              {countLabel}
            </Text>
          </View>
        </View>

        <Text style={[styles.description, { color: palette.textSecondary }]}>
          {t('profile.gallery.description')}
        </Text>

        {photoCount === 0 && !pendingPreviewUri ? (
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>
            {t('profile.gallery.empty')}
          </Text>
        ) : null}

        {operationKind === 'uploading' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.progressText, { color: palette.textSecondary }]}
          >
            {t('profile.gallery.adding')}
          </Text>
        ) : null}

        {operationKind === 'deleting' ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.progressText, { color: palette.textSecondary }]}
          >
            {t('profile.gallery.deleting')}
          </Text>
        ) : null}

        <ProfileGalleryAdminGrid
          photos={photos}
          columns={OWN_PROFILE_GALLERY_COLUMNS}
          addLabel={t('profile.gallery.add')}
          addA11y={t('profile.gallery.addA11y')}
          photoA11y={(index, total) =>
            t('profile.gallery.photoA11y', { index, total })
          }
          deleteA11y={(index, total) =>
            t('profile.gallery.deleteA11y', { index, total })
          }
          uploadingA11y={t('profile.gallery.uploadingA11y')}
          operationBusy={operationBusy}
          pendingPreviewUri={pendingPreviewUri}
          onAddPress={() => void handleAddPhoto()}
          onPhotoPress={openGalleryViewer}
          onDeletePress={(photo) => handleDeletePhoto(photo)}
        />
      </ScrollView>

      <View
        pointerEvents="none"
        style={[
          styles.statusBarOverlay,
          {
            height: insets.top,
            backgroundColor: palette.background,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  statusBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: screenPadding.horizontal,
  },
  messageText: {
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: fontSize.md * 1.4,
  },
  backBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerBack: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  countText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  description: {
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.45,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: fontSize.md,
    marginBottom: spacing.md,
  },
  progressText: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
