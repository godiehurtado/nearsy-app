import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

import { firebaseAuth } from '../config/firebaseConfig';
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
  // ✅ Dejar tal cual tu versión (no rompe nada en tu navigator actual)
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeMode: ProfileMode | undefined = (route?.params as RouteParams)
    ?.mode;

  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<ProfileMode>('personal');

  // Top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  // Perfil
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Links por modo
  const [links, setLinks] = useState<SocialLinks>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid; // ✅ tu export real
        if (!uid) throw new Error('User not authenticated.');

        // 1) Perfil para top visuals y modo default
        const profile = await getUserProfile(uid);
        if (cancelled) return;

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

        // 2) Links del modo
        const initial = await getSocialLinks(uid, effectiveMode);
        if (cancelled) return;

        setLinks(initial ?? {});
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load your profile.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeMode]);

  const onChangeLink = (key: keyof SocialLinks, val: string) =>
    setLinks((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (saving) return;

    try {
      setSaving(true);
      const uid = firebaseAuth.currentUser?.uid; // ✅ tu export real
      if (!uid) throw new Error('User not authenticated.');

      await setSocialLinks(uid, mode, links);

      Alert.alert('Saved', 'Your social media has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 20}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: insets.bottom + 120,
            }}
            keyboardShouldPersistTaps="handled"
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

            <View style={styles.container}>
              <Text style={styles.title}>
                Your Social Media ·{' '}
                {mode === 'personal' ? 'Personal' : 'Professional'}
              </Text>
              <Text style={styles.subtitle}>Connect your profiles</Text>

              <Text style={styles.sectionTitle}>Links</Text>
              <View style={styles.card}>
                <SocialInput
                  label="LinkedIn"
                  icon="logo-linkedin"
                  value={links.linkedin ?? ''}
                  onChangeText={(v) => onChangeLink('linkedin', v)}
                  placeholder="https://www.linkedin.com/in/username"
                />
                <SocialInput
                  label="Instagram"
                  icon="logo-instagram"
                  value={links.instagram ?? ''}
                  onChangeText={(v) => onChangeLink('instagram', v)}
                  placeholder="https://www.instagram.com/username"
                />
                <SocialInput
                  label="Facebook"
                  icon="logo-facebook"
                  value={links.facebook ?? ''}
                  onChangeText={(v) => onChangeLink('facebook', v)}
                  placeholder="https://www.facebook.com/username"
                />
                <SocialInput
                  label="YouTube"
                  icon="logo-youtube"
                  value={links.youtube ?? ''}
                  onChangeText={(v) => onChangeLink('youtube', v)}
                  placeholder="https://www.youtube.com/@username"
                />
                <SocialInput
                  label="Twitter / X"
                  icon="logo-twitter"
                  value={links.twitter ?? ''}
                  onChangeText={(v) => onChangeLink('twitter', v)}
                  placeholder="https://twitter.com/username"
                />
                <SocialInput
                  label="TikTok"
                  icon="logo-tiktok"
                  value={links.tiktok ?? ''}
                  onChangeText={(v) => onChangeLink('tiktok', v)}
                  placeholder="https://www.tiktok.com/@username"
                />
                <SocialInput
                  label="Snapchat"
                  icon="logo-snapchat"
                  value={links.snapchat ?? ''}
                  onChangeText={(v) => onChangeLink('snapchat', v)}
                  placeholder="https://www.snapchat.com/add/username"
                />
                <SocialInput
                  label="Website"
                  icon="globe-outline"
                  value={links.website ?? ''}
                  onChangeText={(v) => onChangeLink('website', v)}
                  placeholder="https://yourdomain.com"
                />
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.bottomBar,
              { paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <TouchableOpacity
              style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={styles.bottomSaveText}>Save social links</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SocialInput({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
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
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[styles.input, styles.inputEditing]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  container: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
  inputEditing: {
    borderWidth: 1.5,
    borderColor: '#3B5A85',
    backgroundColor: '#EEF2FF',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bottomSaveBtn: {
    height: 50,
    borderRadius: 999,
    backgroundColor: '#3B5A85',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
