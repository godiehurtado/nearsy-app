// src/screens/SocialMediaScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';

import TopHeader from '../components/TopHeader';
import type { SocialLinks } from '../types/profile';
import { getUserProfile } from '../services/firestoreService';
import {
  getSocialLinks,
  setSocialLinks,
  type ProfileMode,
} from '../services/profileExtras';

type RouteParams = { mode?: ProfileMode };

export default function SocialMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeMode: ProfileMode | undefined = route?.params?.mode;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Modo actual (personal/professional)
  const [mode, setMode] = useState<ProfileMode>('personal');

  // Top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  // Perfil
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [displayName] = useState('Your Social Media');

  // Links por modo
  const [links, setLinks] = useState<SocialLinks>({});

  useEffect(() => {
    (async () => {
      try {
        const uid = getAuth().currentUser?.uid;
        if (!uid) throw new Error('User not authenticated.');

        // 1) Cargar perfil para top visuals y modo por defecto
        const profile = await getUserProfile(uid);
        setTopBarColor(profile?.topBarColor ?? '#3B5A85');
        setTopBarMode(
          (profile as any)?.topBarMode ??
            (profile?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage((profile as any)?.topBarImage ?? null);
        setProfileImage(profile?.profileImage ?? null);

        const effectiveMode: ProfileMode =
          routeMode ?? (profile?.mode as ProfileMode) ?? 'personal';
        setMode(effectiveMode);

        // 2) Cargar links del modo
        const initial = await getSocialLinks(uid, effectiveMode);
        setLinks(initial);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load your profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [routeMode]);

  const onChangeLink = (key: keyof SocialLinks, val: string) =>
    setLinks((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    try {
      setSaving(true);
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');
      await setSocialLinks(uid, mode, links);
      Alert.alert('Saved', 'Your social media has been updated.');
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
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
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      {/* Top unificado */}
      <TopHeader
        topBarMode={topBarMode}
        topBarColor={topBarColor}
        topBarImage={topBarImage}
        profileImage={profileImage}
        leftIcon="chevron-back"
        onLeftPress={() => navigation.goBack()}
        rightIcon={isEditing ? 'checkmark' : 'pencil'}
        onRightPress={isEditing ? handleSave : () => setIsEditing(true)}
        rightDisabled={saving}
        rightLoading={saving}
        showAvatar
      />

      <View style={styles.container}>
        <Text style={styles.title}>
          {displayName} · {mode === 'personal' ? 'Personal' : 'Professional'}
        </Text>
        <Text style={styles.subtitle}>Connect your profiles</Text>

        {/* Links */}
        <Text style={styles.sectionTitle}>Links</Text>
        <View style={styles.card}>
          <SocialInput
            label="LinkedIn"
            icon="logo-linkedin"
            value={links.linkedin ?? ''}
            onChangeText={(v) => onChangeLink('linkedin', v)}
            placeholder="https://www.linkedin.com/in/username"
            editable={isEditing}
          />
          <SocialInput
            label="Instagram"
            icon="logo-instagram"
            value={links.instagram ?? ''}
            onChangeText={(v) => onChangeLink('instagram', v)}
            placeholder="https://www.instagram.com/username"
            editable={isEditing}
          />
          <SocialInput
            label="Facebook"
            icon="logo-facebook"
            value={links.facebook ?? ''}
            onChangeText={(v) => onChangeLink('facebook', v)}
            placeholder="https://www.facebook.com/username"
            editable={isEditing}
          />
          <SocialInput
            label="YouTube"
            icon="logo-youtube"
            value={links.youtube ?? ''}
            onChangeText={(v) => onChangeLink('youtube', v)}
            placeholder="https://www.youtube.com/@username"
            editable={isEditing}
          />
          <SocialInput
            label="Twitter / X"
            icon="logo-twitter"
            value={links.twitter ?? ''}
            onChangeText={(v) => onChangeLink('twitter', v)}
            placeholder="https://twitter.com/username"
            editable={isEditing}
          />
          <SocialInput
            label="TikTok"
            icon="logo-tiktok"
            value={links.tiktok ?? ''}
            onChangeText={(v) => onChangeLink('tiktok', v)}
            placeholder="https://www.tiktok.com/@username"
            editable={isEditing}
          />
          <SocialInput
            label="Snapchat"
            icon="logo-snapchat"
            value={links.snapchat ?? ''}
            onChangeText={(v) => onChangeLink('snapchat', v)}
            placeholder="https://www.snapchat.com/@username"
            editable={isEditing}
          />
          <SocialInput
            label="Website"
            icon="globe-outline"
            value={links.website ?? ''}
            onChangeText={(v) => onChangeLink('website', v)}
            placeholder="https://yourdomain.com"
            editable={isEditing}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function SocialInput({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  editable?: boolean;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={18} color="#1E3A8A" />
        <Text style={{ fontWeight: '600', color: '#111827' }}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={editable}
        selectTextOnFocus={editable}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, !editable && { opacity: 0.7 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  container: {
    paddingHorizontal: 20,
    paddingTop: 20, // aire bajo el avatar
  },

  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
  },
  subtitle: { color: '#6B7280', textAlign: 'center', marginBottom: 16 },

  sectionTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 8,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
});
