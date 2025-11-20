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
};

export default function ProfileQuickActions({
  onOpenInterests,
  onOpenSocial,
  onOpenGallery,
  onOpenAffiliations,
  stats,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Quick actions</Text>
      <View style={styles.grid}>
        <Tile
          icon="sparkles-outline"
          title="Affiliations"
          subtitle={`${stats?.affiliationsCount ?? 0} selected`}
          onPress={onOpenAffiliations}
        />
        <Tile
          icon="sparkles-outline"
          title="Interests"
          subtitle={`${stats?.interestsCount ?? 0} selected`}
          onPress={onOpenInterests}
        />
        <Tile
          icon="share-social-outline"
          title="Social media"
          subtitle={`${stats?.socialCount ?? 0} connected`}
          onPress={onOpenSocial}
        />
        <Tile
          icon="images-outline"
          title="Gallery"
          subtitle={`${stats?.photosCount ?? 0} photos`}
          onPress={onOpenGallery}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
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
  grid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
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
  tileTitle: { fontWeight: '700', color: '#FFFFFF' }, // Texto blanco
  tileSubtitle: { color: '#E0E7FF', fontSize: 12 }, // Blanco más suave para contraste
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
