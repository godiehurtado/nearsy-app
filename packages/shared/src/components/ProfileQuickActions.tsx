// src/components/ProfileQuickActions.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  onOpenInterests: () => void;
  onOpenSocial: () => void;
  onOpenGallery: () => void;
  onOpenAffiliations: () => void;
  stats?: {
    interestsCount?: number;
    socialCount?: number;
    photosCount?: number;
    affiliationsCount?: number;
  };
  compact?: boolean; // 👈 responsive
  affiliationsRef?: (ref: View | null) => void;
  interestsRef?: (ref: View | null) => void;
  socialRef?: (ref: View | null) => void;
  galleryRef?: (ref: View | null) => void;
  affiliationsGuideHighlight?: boolean;
  interestsGuideHighlight?: boolean;
  socialGuideHighlight?: boolean;
  galleryGuideHighlight?: boolean;
  affiliationsGuideDimmed?: boolean;
  interestsGuideDimmed?: boolean;
  socialGuideDimmed?: boolean;
  galleryGuideDimmed?: boolean;
};

function GuideTileSlot({
  slotRef,
  highlight,
  dimmed,
  compact,
  children,
}: {
  slotRef?: (ref: View | null) => void;
  highlight?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      ref={slotRef}
      style={[styles.tileSlot, compact && styles.tileSlotCompact]}
    >
      <View style={[styles.tileSlotInner, dimmed && styles.tileDimmed]}>
        {children}
      </View>
      {highlight ? (
        <View style={styles.guideHighlightOverlay} pointerEvents="none" />
      ) : null}
    </View>
  );
}

export default function ProfileQuickActions({
  onOpenInterests,
  onOpenSocial,
  onOpenGallery,
  onOpenAffiliations,
  stats,
  compact,
  affiliationsRef,
  interestsRef,
  socialRef,
  galleryRef,
  affiliationsGuideHighlight,
  interestsGuideHighlight,
  socialGuideHighlight,
  galleryGuideHighlight,
  affiliationsGuideDimmed,
  interestsGuideDimmed,
  socialGuideDimmed,
  galleryGuideDimmed,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Quick actions</Text>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <GuideTileSlot
          slotRef={affiliationsRef}
          highlight={affiliationsGuideHighlight}
          dimmed={affiliationsGuideDimmed}
          compact={compact}
        >
          <Tile
            icon="sparkles-outline"
            title="Affiliations"
            subtitle={`${stats?.affiliationsCount ?? 0} selected`}
            onPress={onOpenAffiliations}
            compact={compact}
          />
        </GuideTileSlot>
        <GuideTileSlot
          slotRef={interestsRef}
          highlight={interestsGuideHighlight}
          dimmed={interestsGuideDimmed}
          compact={compact}
        >
          <Tile
            icon="sparkles-outline"
            title="Interests"
            subtitle={`${stats?.interestsCount ?? 0} selected`}
            onPress={onOpenInterests}
            compact={compact}
          />
        </GuideTileSlot>
        <GuideTileSlot
          slotRef={socialRef}
          highlight={socialGuideHighlight}
          dimmed={socialGuideDimmed}
          compact={compact}
        >
          <Tile
            icon="share-social-outline"
            title="Social media"
            subtitle={`${stats?.socialCount ?? 0} connected`}
            onPress={onOpenSocial}
            compact={compact}
          />
        </GuideTileSlot>
        <GuideTileSlot
          slotRef={galleryRef}
          highlight={galleryGuideHighlight}
          dimmed={galleryGuideDimmed}
          compact={compact}
        >
          <Tile
            icon="images-outline"
            title="Gallery"
            subtitle={`${stats?.photosCount ?? 0} photos`}
            onPress={onOpenGallery}
            compact={compact}
          />
        </GuideTileSlot>
      </View>
    </View>
  );
}

function Tile({
  icon,
  title,
  subtitle,
  onPress,
  compact,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        compact && styles.tileCompact,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={22} color="#FFFFFF" />
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.tileSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, gap: 10 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  gridCompact: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  /** Fixed grid cell — sizing lives here so guide overlay does not shift layout. */
  tileSlot: {
    position: 'relative',
    minWidth: '47%',
    flexGrow: 1,
  },
  tileSlotCompact: {
    minWidth: '100%',
    alignSelf: 'stretch',
  },
  tileSlotInner: {
    width: '100%',
  },
  tileDimmed: {
    opacity: 0.45,
  },
  guideHighlightOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#3B5A85',
    backgroundColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3B5A85',
    padding: 12,
    borderRadius: 14,
    width: '100%',
  },
  tileCompact: {
    alignSelf: 'stretch',
  },
  tileTitle: { fontWeight: '700', color: '#FFFFFF' },
  tileSubtitle: { color: '#E0E7FF', fontSize: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
