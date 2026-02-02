// src/screens/InterestsScreen.tsx ✅ RNFirebase-only
import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { firebaseAuth } from '../config/firebaseConfig'; // ✅ RNFirebase auth
import TopHeader from '../components/TopHeader';
import InterestsWithLogo from '../components/InterestsWithLogo';
import type { InterestAffiliations } from '../types/profile';
import {
  getUserProfile,
  updateUserProfilePartial,
} from '../services/firestoreService';

type ProfileMode = 'personal' | 'professional';
type RouteParams = { mode: ProfileMode };

export default function InterestsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { mode } = route.params as RouteParams;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
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
  const cleanAffiliations = (aff: InterestAffiliations): InterestAffiliations =>
    Object.fromEntries(
      Object.entries(aff ?? {}).filter(
        ([, arr]) => Array.isArray(arr) && arr.length > 0,
      ),
    ) as InterestAffiliations;

  // Evita el cast a InterestLabel[] (si el union es estricto te da guerra).
  // Guardamos como string[] (Firestore no necesita el union).
  const labelsFromAff = (aff: InterestAffiliations): string[] =>
    Object.keys(aff ?? {});

  const handleSave = async () => {
    try {
      setSaving(true);

      const uid = firebaseAuth.currentUser?.uid; // ✅ RNFirebase
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
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save interests.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid; // ✅ RNFirebase
        if (!uid) throw new Error('User not authenticated.');

        const existing = await getUserProfile(uid);

        setPersonalAff((existing as any)?.personalInterestAffiliations ?? {});
        setProfessionalAff(
          (existing as any)?.professionalInterestAffiliations ?? {},
        );

        setTopBarColor((existing as any)?.topBarColor ?? '#3B5A85');
        setTopBarMode(
          (existing as any)?.topBarMode ??
            ((existing as any)?.topBarImage ? 'image' : 'color'),
        );
        setTopBarImage((existing as any)?.topBarImage ?? null);
        setProfileImage((existing as any)?.profileImage ?? null);
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
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 100 }}
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

          <Text style={styles.headerTitle}>{title}</Text>

          <View style={{ flex: 1, padding: 16 }}>
            <InterestsWithLogo
              value={currentAff}
              onChange={setCurrentAff}
              scope={mode}
              editable={true}
            />
          </View>
        </ScrollView>

        <View style={styles.bottomBar}>
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
                <Text style={styles.bottomSaveText}>Save interests</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loaderText: { color: '#374151' },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 12,
    color: '#111827',
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
    paddingBottom: 16,
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
