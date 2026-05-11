// src/screens/DeleteAccountScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { deleteAccountAndData } from '../services/accountDeletion';
import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';

// ✅ Firestore Web SDK
import { doc, getDoc, setDoc } from 'firebase/firestore';

type ProfileDoc = {
  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';

  phone?: string;
  birthYear?: number;
  visibleToMinAge?: number | null;
  visibleToMaxAge?: number | null;
  blockedContacts?: string[];
  bgVisible?: boolean;

  phoneVerified?: boolean;
};

export default function DeleteAccountScreen() {
  // top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const [pw, setPw] = useState('');
  const [showReauth, setShowReauth] = useState(false);

  const nav = useNavigation<any>();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  // ui
  const [loading, setLoading] = useState(true);

  const canDelete = typed.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) {
          if (!cancelled) setLoading(false);
          return;
        }

        const snap = await getDoc(doc(firestoreDb, 'users', uid));

        if (!cancelled && snap.exists()) {
          const data = snap.data() as ProfileDoc;

          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              await deleteAccountAndData();
              Alert.alert('Done', 'Your account has been deleted.');
            } catch (e: any) {
              const code = e?.code || '';
              if (code === 'auth/requires-recent-login') {
                setShowReauth(true);
                return;
              }
              Alert.alert('Error', e?.message || 'Could not delete account.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: 110,
          }}
        >
          <TopHeader
            topBarMode={topBarMode}
            topBarColor={topBarColor}
            topBarImage={topBarImage}
            profileImage={profileImage}
            showAvatar
          />
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 10 }}>
              Delete account
            </Text>

            <Text style={{ color: '#374151', marginBottom: 14 }}>
              Type DELETE to confirm. Your profile data and photos will be
              removed.
            </Text>

            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Type DELETE"
              autoCapitalize="characters"
              style={{
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 12,
                padding: 12,
                marginBottom: 14,
              }}
            />

            {showReauth && (
              <View style={{ marginTop: 16, marginBottom: 32 }}>
                <Text style={{ color: '#374151', marginBottom: 8 }}>
                  For security, please confirm your password to continue.
                </Text>

                <TextInput
                  value={pw}
                  onChangeText={setPw}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                  style={{
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                />

                <TouchableOpacity
                  onPress={async () => {
                    try {
                      setBusy(true);
                      const { reauthWithPassword } =
                        await import('../services/reauth');
                      await reauthWithPassword(pw);

                      // Reintenta borrar
                      await deleteAccountAndData();

                      Alert.alert('Done', 'Your account has been deleted.');
                      nav.reset({ index: 0, routes: [{ name: 'Login' }] });
                    } catch (err: any) {
                      Alert.alert(
                        'Error',
                        err?.message || 'Could not confirm password.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={!pw.trim() || busy}
                  activeOpacity={0.9}
                  style={{
                    backgroundColor: pw.trim() ? '#B91C1C' : '#9CA3AF',
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: 'center',
                    opacity: busy ? 0.8 : 1,
                  }}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '800' }}>
                      Confirm password and delete
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {!showReauth && (
              <TouchableOpacity
                disabled={!canDelete || busy}
                onPress={handleDelete}
                activeOpacity={0.9}
                style={{
                  backgroundColor: canDelete ? '#B91C1C' : '#9CA3AF',
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: busy ? 0.8 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '800' }}>
                    Delete permanently
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => nav.goBack()}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={{ color: '#3B5A85', fontWeight: '700' }}>Back</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
