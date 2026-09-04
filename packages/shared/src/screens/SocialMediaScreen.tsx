import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { firebaseAuth } from '../config/firebaseConfig';
import TopHeader from '../components/TopHeader';
import GuideOnboardingCard from '../components/GuideOnboardingCard';
import type { SocialLinks } from '../types/profile';
import { GUIDE_AUDIO } from '../constants/guideAudioAssets';
import { useGuideAudio } from '../hooks/useGuideAudio';
import { getUserProfile } from '../services/firestoreService';
import {
  getSocialLinks,
  setSocialLinks,
  type ProfileMode,
} from '../services/profileExtras';

type RouteParams = {
  uid?: string;
  mode?: ProfileMode;
};

type SocialFieldKey = Exclude<keyof SocialLinks, 'custom'>;

type SocialIconSet = 'ionicons' | 'fontawesome6';

const SOCIAL_ICON_COLOR = '#1E3A8A';

const SOCIAL_FIELDS: {
  key: SocialFieldKey;
  label: string;
  iconSet?: SocialIconSet;
  icon: React.ComponentProps<typeof Ionicons>['name'] | 'x-twitter';
  audio: number;
  placeholder: string;
}[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: 'logo-linkedin',
    audio: GUIDE_AUDIO.social.linkedin,
    placeholder: 'https://www.linkedin.com/in/username',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    audio: GUIDE_AUDIO.social.instagram,
    placeholder: 'https://www.instagram.com/username',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    audio: GUIDE_AUDIO.social.facebook,
    placeholder: 'https://www.facebook.com/username',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: 'logo-youtube',
    audio: GUIDE_AUDIO.social.youtube,
    placeholder: 'https://www.youtube.com/@username',
  },
  {
    key: 'twitter',
    label: 'X',
    iconSet: 'fontawesome6',
    icon: 'x-twitter',
    audio: GUIDE_AUDIO.social.twitter,
    placeholder: 'https://twitter.com/username',
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'logo-tiktok',
    audio: GUIDE_AUDIO.social.tiktok,
    placeholder: 'https://www.tiktok.com/@username',
  },
  {
    key: 'snapchat',
    label: 'Snapchat',
    icon: 'logo-snapchat',
    audio: GUIDE_AUDIO.social.snapchat,
    placeholder: 'https://www.snapchat.com/add/username',
  },
  {
    key: 'website',
    label: 'Website',
    icon: 'globe-outline',
    audio: GUIDE_AUDIO.social.website,
    placeholder: 'https://yourdomain.com',
  },
];

export default function SocialMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const routeMode: ProfileMode | undefined = (route?.params as RouteParams)
    ?.mode;
  const routeUid: string | undefined = (route?.params as RouteParams)?.uid;

  const insets = useSafeAreaInsets();
  const { playAudio } = useGuideAudio();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [setupGuideDismissed, setSetupGuideDismissed] = useState(false);

  const [mode, setMode] = useState<ProfileMode>('personal');

  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [links, setLinks] = useState<SocialLinks>({});

  const isEmptyLinks = useMemo(
    () =>
      SOCIAL_FIELDS.every(({ key }) => !(links[key] ?? '').trim()),
    [links],
  );

  const setupGuideVisible =
    !loading && !setupGuideDismissed && isEmptyLinks;

  const dismissSetupGuide = useCallback(() => {
    setSetupGuideDismissed(true);
  }, []);

  const playFieldHelp = useCallback(
    (audio: number) => {
      void playAudio(audio);
    },
    [playAudio],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = routeUid || firebaseAuth.currentUser?.uid;
        if (!uid) throw new Error('User not authenticated.');

        const profile = await getUserProfile(uid);
        if (cancelled) return;

        if (!profile) {
          const effectiveMode: ProfileMode = routeMode ?? 'personal';

          setTopBarColor('#3B5A85');
          setTopBarMode('color');
          setTopBarImage(null);
          setProfileImage(null);
          setMode(effectiveMode);
          setLinks({});
          return;
        }

        setTopBarColor(profile?.topBarColor ?? '#3B5A85');
        setTopBarMode(
          (profile as any)?.topBarMode ??
            ((profile as any)?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage((profile as any)?.topBarImage ?? null);
        setProfileImage(profile?.profileImage ?? null);

        const effectiveMode: ProfileMode =
          routeMode ?? ((profile as any)?.mode as ProfileMode) ?? 'personal';

        setMode(effectiveMode);

        const initial = await getSocialLinks(uid, effectiveMode);
        if (cancelled) return;

        setLinks(initial ?? {});
      } catch (e: any) {
        if (__DEV__) {
          console.error('[SocialMediaScreen] Error loading social links', e);
        }

        const effectiveMode: ProfileMode = routeMode ?? 'personal';

        setTopBarColor('#3B5A85');
        setTopBarMode('color');
        setTopBarImage(null);
        setProfileImage(null);
        setMode(effectiveMode);
        setLinks({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [routeMode, routeUid]);

  const onChangeLink = (key: SocialFieldKey, val: string) =>
    setLinks((p) => ({ ...p, [key]: val }));

  const handleSave = async () => {
    if (saving) return;

    try {
      setSaving(true);

      const uid = routeUid || firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      await setSocialLinks(uid, mode, links);

      Alert.alert('Saved', 'Your social media has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      if (__DEV__) {
        console.error('[SocialMediaScreen] Error saving social links', e);
      }

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
              paddingTop: setupGuideVisible ? 120 : 0,
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
                {SOCIAL_FIELDS.map((field) => (
                  <SocialInput
                    key={field.key}
                    label={field.label}
                    iconSet={field.iconSet}
                    icon={field.icon}
                    value={links[field.key] ?? ''}
                    onChangeText={(v) => onChangeLink(field.key, v)}
                    placeholder={field.placeholder}
                    onInfoPress={() => playFieldHelp(field.audio)}
                  />
                ))}
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

      {setupGuideVisible ? (
        <Animated.View
          entering={FadeInDown.duration(350)}
          style={[styles.floatingGuideCard, { top: insets.top + 10 }]}
          pointerEvents="box-none"
        >
          <GuideOnboardingCard
            stepIndex={0}
            totalSteps={1}
            title="Add your social links"
            description="Tap the info icon beside each network to hear what to enter."
            showBack={false}
            showNext
            nextLabel="Got it"
            onNext={dismissSetupGuide}
            onSkip={dismissSetupGuide}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

function SocialFieldIcon({
  iconSet = 'ionicons',
  icon,
}: {
  iconSet?: SocialIconSet;
  icon: React.ComponentProps<typeof Ionicons>['name'] | 'x-twitter';
}) {
  if (iconSet === 'fontawesome6') {
    return (
      <FontAwesome6
        name={icon as React.ComponentProps<typeof FontAwesome6>['name']}
        size={18}
        color={SOCIAL_ICON_COLOR}
      />
    );
  }

  return (
    <Ionicons
      name={icon as React.ComponentProps<typeof Ionicons>['name']}
      size={18}
      color={SOCIAL_ICON_COLOR}
    />
  );
}

function SocialInput({
  label,
  iconSet,
  icon,
  value,
  onChangeText,
  placeholder,
  onInfoPress,
}: {
  label: string;
  iconSet?: SocialIconSet;
  icon: React.ComponentProps<typeof Ionicons>['name'] | 'x-twitter';
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onInfoPress?: () => void;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <SocialFieldIcon iconSet={iconSet} icon={icon} />
          <Text style={styles.labelText}>{label}</Text>
        </View>
        {onInfoPress ? (
          <TouchableOpacity
            onPress={onInfoPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Help for ${label}`}
            activeOpacity={0.7}
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        ) : null}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  labelText: {
    fontWeight: '600',
    color: '#111827',
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

  floatingGuideCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
});
