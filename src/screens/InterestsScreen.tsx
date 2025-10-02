// src/screens/InterestsScreen.tsx
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';

import TopHeader from '../components/TopHeader';
import InterestsWithLogo from '../components/InterestsWithLogo';
import { InterestAffiliations, InterestLabel } from '../types/profile';
import {
  getUserProfile,
  updateUserProfilePartial,
} from '../services/firestoreService';

type RouteParams = { mode: 'personal' | 'professional' };

export default function InterestsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { mode } = route.params as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3A5985');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);

  const [personalAff, setPersonalAff] = useState<InterestAffiliations>({});
  const [professionalAff, setProfessionalAff] = useState<InterestAffiliations>(
    {},
  );

  const currentAff = mode === 'personal' ? personalAff : professionalAff;
  const setCurrentAff =
    mode === 'personal' ? setPersonalAff : setProfessionalAff;

  const title = useMemo(
    () => `${mode === 'personal' ? 'Personal' : 'Professional'} Interests`,
    [mode],
  );

  // helpers
  const cleanAffiliations = (aff: InterestAffiliations) =>
    Object.fromEntries(
      Object.entries(aff).filter(
        ([, arr]) => Array.isArray(arr) && arr.length > 0,
      ),
    ) as InterestAffiliations;

  const labelsFromAff = (aff: InterestAffiliations) =>
    Object.keys(aff) as InterestLabel[];

  const handleSave = async () => {
    try {
      setSaving(true);
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      if (mode === 'personal') {
        const clean = cleanAffiliations(personalAff);
        const labels = labelsFromAff(clean);
        await updateUserProfilePartial(uid, {
          personalInterests: labels,
          personalInterestAffiliations: clean,
        });
      } else {
        const clean = cleanAffiliations(professionalAff);
        const labels = labelsFromAff(clean);
        await updateUserProfilePartial(uid, {
          professionalInterests: labels,
          professionalInterestAffiliations: clean,
        });
      }

      Alert.alert('Saved', 'Your interests were updated.');
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save interests.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const uid = getAuth().currentUser?.uid;
        if (!uid) throw new Error('User not authenticated.');
        const existing = await getUserProfile(uid);

        setPersonalAff(existing?.personalInterestAffiliations ?? {});
        setProfessionalAff(existing?.professionalInterestAffiliations ?? {});
        setTopBarColor(existing?.topBarColor ?? '#3A5985');
        setTopBarMode(
          (existing as any)?.topBarMode ??
            (existing?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage(existing?.topBarImage ?? null);
        setProfileImage(existing?.profileImage ?? null);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load interests.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" />
        <Text style={styles.loaderText}>Loading interests…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {/* Top unificado (imagen/color + marca + avatar colgando + acciones) */}
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

      <Text style={styles.headerTitle}>{title}</Text>

      <View style={{ flex: 1, padding: 16 }}>
        <InterestsWithLogo
          value={currentAff}
          onChange={setCurrentAff}
          scope={mode}
          editable={isEditing}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { color: '#374151' },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20, // aire bajo el avatar colgando
    marginBottom: 12,
    color: '#111827',
  },
});
