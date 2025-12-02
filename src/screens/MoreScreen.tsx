// src/screens/MoreScreen.tsx
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth, signOut } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';
import TopHeader from '../components/TopHeader';
import { Ionicons } from '@expo/vector-icons';
import {
  startBackgroundLocation,
  stopBackgroundLocation,
} from '../services/backgroundLocation';

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

  // user email (para el “título”)
  const [userEmail, setUserEmail] = useState<string>('');

  // data
  const [phone, setphone] = useState('');
  const [birthYear, setBirthYear] = useState<string>(''); // mantener como string para input
  const [visibleToMinAge, setVisibleToMinAge] = useState<string>(''); // string -> number al guardar
  const [visibleToMaxAge, setVisibleToMaxAge] = useState<string>('');
  const [blockedContacts, setBlockedContacts] = useState<string[]>([]);
  const [newBlocked, setNewBlocked] = useState('');

  // ui
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edición por campo
  const [activeField, setActiveField] = useState<FieldId | null>(null);
  const isFieldActive = (f: FieldId) => activeField === f;
  const isEditingAny = activeField !== null;

  // BG location toggle
  const [bgVisible, setBgVisible] = useState<boolean>(false);
  const [bgChanging, setBgChanging] = useState<boolean>(false); // loader local del switch

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    (async () => {
      try {
        const auth = getAuth();
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        setUserEmail(auth.currentUser?.email ?? '');

        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          const data = snap.data() as ProfileDoc;

          // top
          setTopBarColor(data.topBarColor ?? '#3B5A85');
          setTopBarMode(
            data.topBarMode ?? (data.topBarImage ? 'image' : 'color'),
          );
          setTopBarImage(data.topBarImage ?? null);
          setProfileImage(data.profileImage ?? null);

          // data
          setphone(data.phone ?? '');
          setBirthYear(
            typeof data.birthYear === 'number' && data.birthYear > 1900
              ? String(data.birthYear)
              : '',
          );
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
          setBlockedContacts(
            Array.isArray(data.blockedContacts) ? data.blockedContacts : [],
          );
          setBgVisible(!!data.bgVisible);
        }
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Could not load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const validateAndParse = () => {
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
      phone: phone.trim(),
      birthYear: by,
      visibleToMinAge: minA ?? null,
      visibleToMaxAge: maxA ?? null,
      blockedContacts,
    };
  };

  const handleToggleBg = async (next: boolean) => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) {
      Alert.alert('Auth', 'Please log in again.');
      return;
    }

    // No se puede en web
    if (Platform.OS === 'web') {
      Alert.alert(
        'Unsupported',
        'Background location is not available on web.',
      );
      return;
    }

    try {
      setBgChanging(true);

      // Persistimos primero la preferencia (optimista)
      await setDoc(
        doc(firestore, 'users', uid),
        { bgVisible: next, updatedAt: new Date().toISOString() },
        { merge: true },
      );

      if (next) {
        // Encender BG → pedirá permisos si faltan
        await startBackgroundLocation({ uid });
        setBgVisible(true);
        Alert.alert(
          'Enabled',
          'You will stay visible to nearby users in background.',
        );
      } else {
        // Apagar BG
        await stopBackgroundLocation();
        setBgVisible(false);
        Alert.alert('Disabled', 'Background visibility is now off.');
      }
    } catch (e: any) {
      // Revertir estado si falló
      setBgVisible((prev) => (!next && prev ? prev : !prev));
      Alert.alert(
        'Error',
        e?.message || 'Could not update background location.',
      );
    } finally {
      setBgChanging(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const parsed = validateAndParse();
      const uid = getAuth().currentUser?.uid;
      if (!uid) throw new Error('User not authenticated.');

      await setDoc(
        doc(firestore, 'users', uid),
        {
          phone: parsed.phone,
          birthYear: parsed.birthYear,
          visibleToMinAge: parsed.visibleToMinAge,
          visibleToMaxAge: parsed.visibleToMaxAge,
          blockedContacts: parsed.blockedContacts,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

      Alert.alert('Saved', 'Your settings have been updated.');
      setActiveField(null);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(getAuth());
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error: any) {
      Alert.alert('Logout error', error.message);
    }
  };

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const isValidPhone = (value: string) =>
    /^[0-9+\-\s()]{7,}$/.test(value.trim());

  const addBlocked = () => {
    if (!isFieldActive('blocked')) return;

    const v = newBlocked.trim();
    if (!v) return;

    const isEmail = isValidEmail(v);
    const isPhone = isValidPhone(v);

    if (!isEmail && !isPhone) {
      Alert.alert(
        'Invalid contact',
        'Please enter a valid email address or phone number.',
      );
      return;
    }

    if (blockedContacts.includes(v)) {
      Alert.alert('Notice', 'This contact is already in your blocked list.');
      return;
    }
    const norm = isEmail ? v.toLowerCase() : v.replace(/\s+/g, '');
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
          {/* “Título”: email en recuadro redondeado */}
          <View style={styles.emailPill}>
            <Text style={styles.emailText}>
              {userEmail || 'No email available'}
            </Text>
          </View>

          {/* Teléfono */}
          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Text style={styles.cardTitle}>Phone number</Text>
              <TouchableOpacity
                onPress={() =>
                  setActiveField((prev) => (prev === 'phone' ? null : 'phone'))
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
              onChangeText={setphone}
              editable={isFieldActive('phone')}
              keyboardType="phone-pad"
            />
            <Text style={styles.hint}>
              This phone is used for contact purposes inside Nearsy (not
              public).
            </Text>
          </View>

          {/* Año de nacimiento */}
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

          {/* Filtros por edad */}
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

          {/* Background visibility (no requiere lápiz, se guarda inmediato) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stay visible in background</Text>

            <View style={styles.row}>
              <Text style={{ flex: 1, color: '#374151' }}>
                Keep your location updated while the app is minimized.
              </Text>
              <Switch
                value={bgVisible}
                onValueChange={handleToggleBg}
                disabled={bgChanging}
              />
            </View>

            <Text style={styles.hint}>
              Requires location permissions. On iOS, a blue bar may appear when
              updating. You can change this anytime.
            </Text>
          </View>

          {/* Bloquear contactos */}
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

      {/* Barra fija inferior para guardar (solo si hay campo en edición) */}
      {isEditingAny && (
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom > 0 ? insets.bottom + 8 : 16,
            },
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
