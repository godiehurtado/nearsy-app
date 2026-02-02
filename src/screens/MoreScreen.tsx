// src/screens/MoreScreen.tsx ✅ RNFirebase-only
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import TopHeader from '../components/TopHeader';
import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';

import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';

// 👇 contactos
import {
  isContactsSyncEnabled,
  setContactsSyncEnabled,
  syncContactsSafe,
  disableContactsSyncAndPurge,
} from '../services/contactsSync';

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

type FieldId = 'phone' | 'birthYear' | 'visibilityAges' | 'blocked';

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // top visuals
  const [topBarColor, setTopBarColor] = useState('#3B5A85');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // user email
  const [userEmail, setUserEmail] = useState<string>('');

  // phone actual en Firestore (para detectar cambios)
  const [originalPhone, setOriginalPhone] = useState<string>('');

  // data editable
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState<string>('');
  const [visibleToMinAge, setVisibleToMinAge] = useState<string>('');
  const [visibleToMaxAge, setVisibleToMaxAge] = useState<string>('');
  const [blockedContacts, setBlockedContacts] = useState<string[]>([]);
  const [newBlocked, setNewBlocked] = useState('');

  // ui
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // field editing
  const [activeField, setActiveField] = useState<FieldId | null>(null);
  const isFieldActive = (f: FieldId) => activeField === f;
  const isEditingAny = activeField !== null;

  // BG location toggle
  const [bgVisible, setBgVisible] = useState<boolean>(false);
  const [bgChanging, setBgChanging] = useState<boolean>(false);

  // contactos
  const [contactsEnabled, setContactsEnabled] = useState<boolean>(false);
  const [contactsChanging, setContactsChanging] = useState<boolean>(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    (async () => {
      try {
        const uid = firebaseAuth.currentUser?.uid;
        if (!uid) return;

        setUserEmail(firebaseAuth.currentUser?.email ?? '');

        // ✅ RNFirebase get()
        const snap = await firestoreDb.collection('users').doc(uid).get();

        if (snap.exists) {
          const data = snap.data() as ProfileDoc;

          // top bar
          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);

          // phone
          const phoneFromDb = data.phone ?? '';
          setOriginalPhone(phoneFromDb);
          setPhone(phoneFromDb);

          // birth year
          setBirthYear(
            typeof data.birthYear === 'number' && data.birthYear > 1900
              ? String(data.birthYear)
              : '',
          );

          // age visibility
          setVisibleToMinAge(
            typeof data.visibleToMinAge === 'number'
              ? String(data.visibleToMinAge)
              : '',
          );
          setVisibleToMaxAge(
            typeof data.visibleToMaxAge === 'number'
              ? String(data.visibleToMaxAge)
              : '',
          );

          // blocked contacts
          setBlockedContacts(
            Array.isArray(data.blockedContacts) ? data.blockedContacts : [],
          );

          // bg visibility
          setBgVisible(!!data.bgVisible);
        }

        // preferencia local de contactos
        const enabled = await isContactsSyncEnabled();
        setContactsEnabled(enabled);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  // ✅ Validador E.164 igual que en RegisterScreen
  const isValidPhone = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    if (!cleaned) return false;
    // E.164: + y de 8 a 15 dígitos
    return /^\+[1-9]\d{7,14}$/.test(cleaned);
  };

  const validateAndParse = () => {
    const rawPhone = phone.trim();
    const cleanedPhone = rawPhone.replace(/\s/g, '');

    // 📱 Reglas según plataforma
    if (Platform.OS === 'android') {
      // ANDROID: obligatorio y E.164
      if (!cleanedPhone) {
        throw new Error(
          'Phone number is required on this device. Please include your country code, e.g. +1 or +57.',
        );
      }
      if (!isValidPhone(cleanedPhone)) {
        throw new Error(
          'Phone number must be valid and include country code, e.g. +1 305 123 4567 or +57 300 123 4567.',
        );
      }
    } else {
      // iOS / otros: opcional, pero si viene debe ser válido
      if (cleanedPhone && !isValidPhone(cleanedPhone)) {
        throw new Error(
          'If you set a phone number, it must be valid and include country code, e.g. +1 or +57.',
        );
      }
    }

    const by = birthYear.trim() ? Number(birthYear.trim()) : undefined;
    if (birthYear.trim()) {
      if (isNaN(by!) || by! < 1900 || by! > currentYear) {
        throw new Error('Birth year must be a valid year.');
      }
    }

    const minA = visibleToMinAge.trim()
      ? Number(visibleToMinAge.trim())
      : undefined;
    const maxA = visibleToMaxAge.trim()
      ? Number(visibleToMaxAge.trim())
      : undefined;

    if (minA !== undefined && (isNaN(minA) || minA < 13 || minA > 120))
      throw new Error('Min age must be between 13 and 120.');
    if (maxA !== undefined && (isNaN(maxA) || maxA < 13 || maxA > 120))
      throw new Error('Max age must be between 13 and 120.');

    if (minA !== undefined && maxA !== undefined && minA > maxA)
      throw new Error('Min age cannot be greater than max age.');

    return {
      phone: cleanedPhone, // 👈 Guardamos ya normalizado (sin espacios)
      birthYear: by,
      visibleToMinAge: minA ?? null,
      visibleToMaxAge: maxA ?? null,
      blockedContacts,
    };
  };

  const handleToggleBg = async (next: boolean) => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) {
      Alert.alert('Auth', 'Please log in again.');
      return;
    }

    if (Platform.OS === 'web') {
      Alert.alert(
        'Unsupported',
        'Background location is not available on web.',
      );
      return;
    }

    try {
      setBgChanging(true);

      // ✅ RNFirebase set(merge)
      await firestoreDb
        .collection('users')
        .doc(uid)
        .set({ bgVisible: next, updatedAt: Date.now() }, { merge: true });

      if (next) {
        await startBackgroundLocation({ uid });
        setBgVisible(true);
        Alert.alert(
          'Enabled',
          'You will stay visible to nearby users in background.',
        );
      } else {
        await stopBackgroundLocation();
        setBgVisible(false);
        Alert.alert('Disabled', 'Background visibility is now off.');
      }
    } catch (e: any) {
      setBgVisible(!next);
      const msg = e?.message || 'Could not update background location.';
      Alert.alert('Error', msg);
    } finally {
      setBgChanging(false);
    }
  };

  // 👇 toggle de contactos
  const handleToggleContacts = async (next: boolean) => {
    setContactsEnabled(next);

    try {
      setContactsChanging(true);

      if (next) {
        const ok = await syncContactsSafe();

        if (!ok) {
          setContactsEnabled(false);
          await setContactsSyncEnabled(false);
          Alert.alert(
            'Permission needed',
            'We could not access your contacts. Please grant permission in your device settings if you want Nearsy to use your contacts.',
          );
          return;
        }

        Alert.alert(
          'Contacts enabled',
          'Nearsy will use your phone contacts to highlight familiar people in nearby alerts. Sync will run in the background.',
        );
      } else {
        await disableContactsSyncAndPurge();
        Alert.alert(
          'Contacts disabled',
          'Nearsy will no longer use your phone contacts for nearby alerts.',
        );
      }
    } catch (e: any) {
      setContactsEnabled(!next);
      Alert.alert(
        'Error',
        e?.message || 'Could not update contacts permission.',
      );
    } finally {
      setContactsChanging(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const parsed = validateAndParse();
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      const trimmedPhone = parsed.phone;
      const normalizedOld = (originalPhone || '').replace(/\s+/g, '');
      const normalizedNew = trimmedPhone.replace(/\s+/g, '');
      const phoneChanged = normalizedOld !== normalizedNew;

      const baseUpdate: any = {
        birthYear: parsed.birthYear,
        visibleToMinAge: parsed.visibleToMinAge,
        visibleToMaxAge: parsed.visibleToMaxAge,
        blockedContacts: parsed.blockedContacts,
        updatedAt: Date.now(),
      };

      // 📌 iOS: siempre guardamos el teléfono directamente
      // 📱 Android: solo guardamos el teléfono si NO cambió
      const updateData: any = { ...baseUpdate };

      if (!phoneChanged || Platform.OS === 'ios') {
        updateData.phone = trimmedPhone;
      }

      // ✅ RNFirebase set(merge)
      await firestoreDb
        .collection('users')
        .doc(uid)
        .set(updateData, { merge: true });

      // 🍎 iOS → nunca hay flujo SMS
      if (Platform.OS === 'ios') {
        setOriginalPhone(trimmedPhone);
        Alert.alert('Saved', 'Your settings have been updated.');
        setActiveField(null);
        return;
      }

      // ANDROID: si el teléfono no cambió, solo mensaje y listo
      if (!phoneChanged) {
        setOriginalPhone(trimmedPhone);
        Alert.alert('Saved', 'Your settings have been updated.');
        setActiveField(null);
        return;
      }

      // 📱 ANDROID + teléfono CAMBIADO → flujo de verificación por SMS
      Alert.alert(
        'Phone verification',
        'We saved your other settings. Now we need to verify your new phone number with a text message.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              navigation.navigate('PhoneVerification', {
                uid,
                phone: trimmedPhone,
                from: 'MoreScreen',
              });
            },
          },
        ],
      );

      setActiveField(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      // ✅ RNFirebase signOut
      await firebaseAuth.signOut();
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (error: any) {
      Alert.alert('Logout error', error?.message ?? 'Unknown error');
    }
  };

  const addBlocked = () => {
    if (!isFieldActive('blocked')) return;

    const v = newBlocked.trim();
    if (!v) return;

    const isEmail = isValidEmail(v);
    const isPhoneVal = isValidPhone(v);

    if (!isEmail && !isPhoneVal) {
      Alert.alert(
        'Invalid contact',
        'Please enter a valid email address or phone number.',
      );
      return;
    }

    const norm = isEmail ? v.toLowerCase() : v.replace(/\s+/g, '');

    if (blockedContacts.includes(norm)) {
      Alert.alert('Notice', 'This contact is already in your blocked list.');
      return;
    }

    setBlockedContacts((prev) => [norm, ...prev]);
    setNewBlocked('');
  };

  const removeBlocked = (value: string) => {
    if (!isFieldActive('blocked')) return;
    setBlockedContacts((prev) => prev.filter((x) => x !== value));
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
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: isEditingAny ? 110 : 40,
          }}
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

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            {/* Email pill */}
            <View style={styles.emailPill}>
              <Text style={styles.emailText}>
                {userEmail || 'No email available'}
              </Text>
            </View>

            {/* Phone */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Phone number</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'phone' ? null : 'phone',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('phone') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('phone') && styles.inputEditing,
                  !isFieldActive('phone') && styles.inputDisabled,
                ]}
                placeholder="+1 555 123 4567"
                value={phone}
                onChangeText={setPhone}
                editable={isFieldActive('phone')}
                keyboardType="phone-pad"
              />
              <Text style={styles.hint}>
                {Platform.OS === 'android'
                  ? 'This phone is used for contact purposes and SMS verification. If you change it, we will verify it with a text message.'
                  : 'This phone is used for contact purposes inside Nearsy (not public). On this device we do not use SMS verification.'}
              </Text>
            </View>

            {/* Birth year */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Year of birth</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'birthYear' ? null : 'birthYear',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('birthYear') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('birthYear') && styles.inputEditing,
                  !isFieldActive('birthYear') && styles.inputDisabled,
                ]}
                placeholder="1995"
                value={birthYear}
                onChangeText={setBirthYear}
                editable={isFieldActive('birthYear')}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>

            {/* Age visibility */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Visibility by age</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'visibilityAges' ? null : 'visibilityAges',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={
                      isFieldActive('visibilityAges') ? '#3B5A85' : '#9CA3AF'
                    }
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Hide me from users younger than</Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('visibilityAges') && styles.inputEditing,
                  !isFieldActive('visibilityAges') && styles.inputDisabled,
                ]}
                placeholder="e.g., 18"
                value={visibleToMinAge}
                onChangeText={setVisibleToMinAge}
                editable={isFieldActive('visibilityAges')}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={[styles.label, { marginTop: 8 }]}>
                Hide me from users older than
              </Text>
              <TextInput
                style={[
                  styles.input,
                  isFieldActive('visibilityAges') && styles.inputEditing,
                  !isFieldActive('visibilityAges') && styles.inputDisabled,
                ]}
                placeholder="e.g., 65"
                value={visibleToMaxAge}
                onChangeText={setVisibleToMaxAge}
                editable={isFieldActive('visibilityAges')}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.hint}>
                Leave blank any of them if you don’t want to set that limit.
              </Text>
            </View>

            {/* Background visibility */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stay visible in background</Text>

              <View style={styles.row}>
                <Text style={{ flex: 1, color: '#374151' }}>
                  Keep your location updated so others can discover you nearby
                  even when the app is closed.
                </Text>

                <Switch
                  value={bgVisible}
                  onValueChange={handleToggleBg}
                  disabled={bgChanging}
                />
              </View>

              <Text style={styles.hint}>
                Requires “Always” location permission. On iOS, a blue indicator
                may appear while Nearsy updates your location in background.
              </Text>

              {bgVisible && (
                <Text
                  style={{
                    marginTop: 8,
                    color: '#065F46',
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  Background visibility is ON.
                </Text>
              )}
            </View>

            {/* Contacts card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Use phone contacts for alerts
              </Text>

              <View style={styles.row}>
                <Text style={{ flex: 1, color: '#374151' }}>
                  Allow Nearsy to safely match your phone contacts with other
                  users, so nearby alerts can highlight familiar people.
                </Text>

                <Switch
                  value={contactsEnabled}
                  onValueChange={handleToggleContacts}
                  disabled={contactsChanging}
                />
              </View>

              <Text style={styles.hint}>
                This is optional. We only store minimal identifiers (no contact
                names or messages are sent to your contacts).
              </Text>
            </View>

            {/* Blocked contacts */}
            <View style={styles.card}>
              <View style={styles.labelRow}>
                <Text style={styles.cardTitle}>Blocked contacts</Text>
                <TouchableOpacity
                  onPress={() =>
                    setActiveField((prev) =>
                      prev === 'blocked' ? null : 'blocked',
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="pencil"
                    size={16}
                    color={isFieldActive('blocked') ? '#3B5A85' : '#9CA3AF'}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[
                    styles.input,
                    styles.flex1,
                    isFieldActive('blocked') && styles.inputEditing,
                    !isFieldActive('blocked') && styles.inputDisabled,
                  ]}
                  placeholder="Email or phone to block"
                  value={newBlocked}
                  onChangeText={setNewBlocked}
                  editable={isFieldActive('blocked')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
                <TouchableOpacity
                  onPress={addBlocked}
                  disabled={!isFieldActive('blocked') || !newBlocked.trim()}
                  style={[
                    styles.addBtn,
                    (!isFieldActive('blocked') || !newBlocked.trim()) && {
                      opacity: 0.6,
                    },
                  ]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {blockedContacts.length > 0 ? (
                <View style={styles.chipsWrap}>
                  {blockedContacts.map((v) => (
                    <View key={v} style={styles.chip}>
                      <Text style={styles.chipText}>{v}</Text>
                      {isFieldActive('blocked') && (
                        <TouchableOpacity
                          onPress={() => removeBlocked(v)}
                          style={styles.chipRemove}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800' }}>
                            ✕
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.hint}>
                  You can block contacts by email or phone number.
                </Text>
              )}
            </View>

            {/* Logout */}
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              activeOpacity={0.9}
            >
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <View style={{ height: 12 + insets.bottom }} />
          </View>
        </ScrollView>

        {/* Bottom save bar */}
        {isEditingAny && (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16 },
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
                  <Text style={styles.bottomSaveText}>Save settings</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  emailPill: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  emailText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: { fontSize: 13, color: '#374151', marginBottom: 6 },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  inputDisabled: { opacity: 0.7 },
  inputEditing: {
    borderWidth: 1.5,
    borderColor: '#3B5A85',
    backgroundColor: '#EEF2FF',
  },

  hint: { color: '#6B7280', marginTop: 8, fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  addBtn: {
    backgroundColor: '#3B5A85',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  chipText: { color: '#111827' },
  chipRemove: {
    marginLeft: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutBtn: {
    marginTop: 10,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },

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
