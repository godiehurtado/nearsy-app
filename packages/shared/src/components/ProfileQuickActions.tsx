// src/components/ProfileQuickActions.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type QuickActionKey =
  | 'affiliations'
  | 'interests'
  | 'social'
  | 'gallery';

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
  highlightedAction?: QuickActionKey | null;
  dimUnhighlighted?: boolean;
};

export default function ProfileQuickActions({
  onOpenInterests,
  onOpenSocial,
  onOpenGallery,
  onOpenAffiliations,
  stats,
  compact,
  highlightedAction = null,
  dimUnhighlighted = false,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Quick actions</Text>

      <View style={[styles.grid, compact && styles.gridCompact]}>
        <Tile
          icon="sparkles-outline"
          title="Affiliations"
          subtitle={`${stats?.affiliationsCount ?? 0} selected`}
          onPress={onOpenAffiliations}
          compact={compact}
          highlighted={highlightedAction === 'affiliations'}
          dimmed={dimUnhighlighted && highlightedAction !== 'affiliations'}
        />
        <Tile
          icon="sparkles-outline"
          title="Interests"
          subtitle={`${stats?.interestsCount ?? 0} selected`}
          onPress={onOpenInterests}
          compact={compact}
          highlighted={highlightedAction === 'interests'}
          dimmed={dimUnhighlighted && highlightedAction !== 'interests'}
        />
        <Tile
          icon="share-social-outline"
          title="Social media"
          subtitle={`${stats?.socialCount ?? 0} connected`}
          onPress={onOpenSocial}
          compact={compact}
          highlighted={highlightedAction === 'social'}
          dimmed={dimUnhighlighted && highlightedAction !== 'social'}
        />
        <Tile
          icon="images-outline"
          title="Gallery"
          subtitle={`${stats?.photosCount ?? 0} photos`}
          onPress={onOpenGallery}
          compact={compact}
          highlighted={highlightedAction === 'gallery'}
          dimmed={dimUnhighlighted && highlightedAction !== 'gallery'}
        />
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
  highlighted = false,
  dimmed = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  compact?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        compact && styles.tileCompact, // 👈 full-width en modo compacto
        highlighted && styles.tileHighlighted,
        dimmed && styles.tileDimmed,
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
  // 👇 En compacto apilamos una debajo de otra
  gridCompact: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#3B5A85', // Azul principal
    padding: 12,
    borderRadius: 14,
    minWidth: '47%',
    flexGrow: 1,
  },
  // 👇 Full width para pantallas con texto grande
  tileCompact: {
    minWidth: '100%',
    alignSelf: 'stretch',
  },
  tileHighlighted: {
    borderWidth: 2,
    borderColor: '#ADCBE3',
  },
  tileDimmed: {
    opacity: 0.45,
  },
  tileTitle: { fontWeight: '700', color: '#FFFFFF' },
  tileSubtitle: { color: '#E0E7FF', fontSize: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
