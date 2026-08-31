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
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useTranslation } from '../../i18n';
import {
  CRJ_GALLERY_UX_CAP,
  type CrjGalleryItem,
} from '../../gallery/onboardingGalleryPersistence';
import {
  GALLERY_GRID_GAP,
  GALLERY_TILE_RADIUS,
} from '../../gallery/galleryGridTokens';

type Props = {
  items: CrjGalleryItem[];
  permissionDenied: boolean;
  onAddPress: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenSettings: () => void;
};

const COLS = 3;

export function OnboardingGalleryStep({
  items,
  permissionDenied,
  onAddPress,
  onRemove,
  onRetry,
  onOpenSettings,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const tileSize = Math.floor((width - 44 - GALLERY_GRID_GAP * 2) / COLS);

  const readyCount = items.filter((item) => item.status === 'ready').length;
  const atCap = items.length >= CRJ_GALLERY_UX_CAP;
  const showEmptyPlaceholders = items.length === 0 && !permissionDenied;

  const countLabel =
    readyCount === 1
      ? t('onboarding.profileCompletion.gallery.addedOne' as any)
      : t('onboarding.profileCompletion.gallery.addedCount' as any, {
          count: readyCount,
        });

  return (
    <View>
      <Text style={[styles.eyebrow, { color: palette.chipText }]}>
        {t('onboarding.profileCompletion.gallery.eyebrow' as any)}
      </Text>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {t('onboarding.profileCompletion.gallery.title' as any)}
      </Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        {t('onboarding.profileCompletion.gallery.body' as any)}
      </Text>
      <Text style={[styles.count, { color: palette.chipText }]}>
        {countLabel}
      </Text>

      {permissionDenied ? (
        <View
          style={[
            styles.deniedCard,
            {
              backgroundColor: palette.surface,
              borderColor: palette.accentBorder,
            },
          ]}
        >
          <Text style={[styles.deniedTitle, { color: palette.textPrimary }]}>
            {t('onboarding.profileCompletion.gallery.permissionTitle' as any)}
          </Text>
          <Text style={[styles.deniedBody, { color: palette.textSecondary }]}>
            {t('onboarding.profileCompletion.gallery.permissionBody' as any)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(
              'onboarding.profileCompletion.gallery.openSettings' as any,
            )}
            onPress={onOpenSettings}
            style={[
              styles.settingsBtn,
              { backgroundColor: palette.primary },
            ]}
          >
            <Text style={styles.settingsText}>
              {t('onboarding.profileCompletion.gallery.openSettings' as any)}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.grid}>
          {!atCap ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'onboarding.profileCompletion.gallery.addA11y' as any,
              )}
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
              <Ionicons name="add" size={28} color={palette.primary} />
              <Text style={[styles.addLabel, { color: palette.textSecondary }]}>
                {t('onboarding.profileCompletion.gallery.add' as any)}
              </Text>
            </Pressable>
          ) : null}

          {items.map((item, index) => (
            <Animated.View
              key={item.id}
              entering={reduceMotion ? undefined : FadeIn.delay(index * 40)}
              exiting={reduceMotion ? undefined : FadeOut.duration(180)}
              style={{ width: tileSize, height: tileSize }}
            >
              <View
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
                  source={{ uri: item.url }}
                  style={styles.image}
                  accessibilityLabel={t(
                    'onboarding.profileCompletion.gallery.photoA11y' as any,
                    { index: index + 1 },
                  )}
                />
                {item.status === 'uploading' ? (
                  <View style={styles.overlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
                {item.status === 'failed' ? (
                  <View style={styles.overlay}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'onboarding.profileCompletion.gallery.retry' as any,
                      )}
                      onPress={() => onRetry(item.id)}
                      style={styles.retryHit}
                    >
                      <Text style={styles.retryText}>
                        {t(
                          'onboarding.profileCompletion.gallery.retry' as any,
                        )}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'onboarding.profileCompletion.gallery.removeA11y' as any,
                    { index: index + 1 },
                  )}
                  onPress={() => onRemove(item.id)}
                  hitSlop={6}
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
            </Animated.View>
          ))}

          {showEmptyPlaceholders
            ? Array.from({ length: CRJ_GALLERY_UX_CAP - 1 }).map((_, index) => (
                <View
                  key={`ph-${index}`}
                  accessible={false}
                  importantForAccessibility="no"
                  style={[
                    styles.tile,
                    styles.placeholder,
                    {
                      width: tileSize,
                      height: tileSize,
                      borderColor: palette.border,
                    },
                  ]}
                />
              ))
            : null}
        </View>
      )}

      {atCap ? (
        <Text style={[styles.capHint, { color: palette.textMuted }]}>
          {t('onboarding.profileCompletion.gallery.capReached' as any, {
            count: CRJ_GALLERY_UX_CAP,
          })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 25,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
    lineHeight: 30,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  count: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
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
    marginTop: 4,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  placeholder: {
    borderStyle: 'dashed',
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
  retryHit: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.extrabold,
    fontSize: fontSize.sm,
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
  deniedCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  deniedTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
  },
  deniedBody: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  settingsBtn: {
    marginTop: spacing.lg,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  settingsText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.sm,
  },
  capHint: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
