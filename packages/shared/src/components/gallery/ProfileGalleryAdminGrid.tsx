import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import {
  GALLERY_GRID_GAP,
  GALLERY_TILE_RADIUS,
  OWN_PROFILE_GALLERY_COLUMNS,
  galleryTileSize,
} from '../../gallery/galleryGridTokens';
import type { GalleryPhoto } from '../../types/profile';

type Props = {
  photos: GalleryPhoto[];
  /** Explicit column count — callers pass this; no route-based detection. */
  columns?: number;
  addLabel: string;
  addA11y: string;
  photoA11y: (index: number, total: number) => string;
  deleteA11y: (index: number, total: number) => string;
  uploadingA11y: string;
  operationBusy: boolean;
  pendingPreviewUri: string | null;
  onAddPress: () => void;
  onPhotoPress: (index: number) => void;
  onDeletePress: (photo: GalleryPhoto, index: number) => void;
};

export function ProfileGalleryAdminGrid({
  photos,
  columns = OWN_PROFILE_GALLERY_COLUMNS,
  addLabel,
  addA11y,
  photoA11y,
  deleteA11y,
  uploadingA11y,
  operationBusy,
  pendingPreviewUri,
  onAddPress,
  onPhotoPress,
  onDeletePress,
}: Props) {
  const { palette } = useAppTheme();
  const { width } = useWindowDimensions();
  const tileSize = galleryTileSize(width, columns);

  const totalWithPending = photos.length + (pendingPreviewUri ? 1 : 0);

  return (
    <View style={styles.grid}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={addA11y}
        accessibilityState={{ disabled: operationBusy }}
        disabled={operationBusy}
        onPress={onAddPress}
        style={[
          styles.tile,
          styles.addTile,
          {
            width: tileSize,
            height: tileSize,
            borderColor: palette.accentBorder,
            backgroundColor: palette.panel,
          },
        ]}
      >
        {operationBusy && pendingPreviewUri ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <>
            <Ionicons name="add" size={28} color={palette.primary} />
            <Text style={[styles.addLabel, { color: palette.textSecondary }]}>
              {addLabel}
            </Text>
          </>
        )}
      </Pressable>

      {photos.map((photo, index) => (
        <View
          key={photo.path || photo.url}
          style={[
            styles.tile,
            {
              width: tileSize,
              height: tileSize,
              borderColor: palette.border,
              backgroundColor: palette.chipBg,
            },
          ]}
        >
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={photoA11y(index + 1, totalWithPending)}
            disabled={operationBusy}
            onPress={() => onPhotoPress(index)}
            style={styles.photoPress}
          >
            <Image
              source={{ uri: photo.url }}
              style={styles.image}
              resizeMode="cover"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deleteA11y(index + 1, totalWithPending)}
            accessibilityState={{ disabled: operationBusy }}
            disabled={operationBusy}
            hitSlop={6}
            onPress={() => onDeletePress(photo, index)}
            style={[
              styles.removeBtn,
              { backgroundColor: palette.background },
            ]}
          >
            <Text style={[styles.removeMark, { color: palette.textPrimary }]}>
              {'\u00D7'}
            </Text>
          </Pressable>
        </View>
      ))}

      {pendingPreviewUri ? (
        <View
          accessibilityLabel={uploadingA11y}
          accessibilityLiveRegion="polite"
          style={[
            styles.tile,
            {
              width: tileSize,
              height: tileSize,
              borderColor: palette.border,
              backgroundColor: palette.chipBg,
            },
          ]}
        >
          <Image
            source={{ uri: pendingPreviewUri }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.overlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GALLERY_GRID_GAP,
  },
  tile: {
    borderRadius: GALLERY_TILE_RADIUS,
    borderWidth: 1,
    overflow: 'hidden',
  },
  addTile: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  addLabel: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  photoPress: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,25,54,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  removeMark: {
    fontSize: 20,
    fontWeight: fontWeight.extrabold,
    lineHeight: 22,
  },
});
