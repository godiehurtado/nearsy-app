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
} from 'react-native';
import { Platform } from 'react-native';
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

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // top visuals
  const [topBarColor, setTopBarColor] = useState('#3A5985');
  const [topBarMode, setTopBarMode] = useState<'color' | 'image'>('color');
  const [topBarImage, setTopBarImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);

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
  const [isEditing, setIsEditing] = useState(false);

  // BG location toggle
  const [bgVisible, setBgVisible] = useState<boolean>(false);
  const [bgChanging, setBgChanging] = useState<boolean>(false); // loader local del switch

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    (async () => {
      try {
        const uid = getAuth().currentUser?.uid;
        if (!uid) return;

        const snap = await getDoc(doc(firestore, 'users', uid));
        if (snap.exists()) {
          const data = snap.data() as ProfileDoc;

          // top
          setTopBarColor(data.topBarColor ?? '#3A5985');
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
    // phone: lo guardamos como string “as-is”
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
      setIsEditing(false);
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

  const addBlocked = () => {
    const v = newBlocked.trim();
    if (!v) return;
    if (blockedContacts.includes(v)) {
      Alert.alert('Notice', 'This contact is already in your blocked list.');
      return;
    }
    setBlockedContacts((prev) => [v, ...prev]);
    setNewBlocked('');
  };

  const removeBlocked = (value: string) => {
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
    <ScrollView
      style={{ flex: 1, backgroundColor: '#fff' }}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
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

      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
        <Text style={styles.screenTitle}>More Options</Text>

        {/* Teléfono */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Phone number</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            placeholder="+1 555 123 4567"
            value={phone}
            onChangeText={setphone}
            editable={isEditing}
            keyboardType="phone-pad"
          />
          <Text style={styles.hint}>
            This phone is used for contact purposes inside Nearsy (not public).
          </Text>
        </View>

        {/* Año de nacimiento */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Year of birth</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            placeholder="1995"
            value={birthYear}
            onChangeText={setBirthYear}
            editable={isEditing}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>

        {/* Filtros por edad */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visibility by age</Text>
          <Text style={styles.label}>Hide me from users younger than</Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            placeholder="e.g., 18"
            value={visibleToMinAge}
            onChangeText={setVisibleToMinAge}
            editable={isEditing}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Text style={[styles.label, { marginTop: 8 }]}>
            Hide me from users older than
          </Text>
          <TextInput
            style={[styles.input, !isEditing && styles.inputDisabled]}
            placeholder="e.g., 65"
            value={visibleToMaxAge}
            onChangeText={setVisibleToMaxAge}
            editable={isEditing}
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
          <Text style={styles.cardTitle}>Blocked contacts</Text>
          <View style={styles.row}>
            <TextInput
              style={[
                styles.input,
                styles.flex1,
                !isEditing && styles.inputDisabled,
              ]}
              placeholder="UID or email to block"
              value={newBlocked}
              onChangeText={setNewBlocked}
              editable={isEditing}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={addBlocked}
              disabled={!isEditing || !newBlocked.trim()}
              style={[
                styles.addBtn,
                (!isEditing || !newBlocked.trim()) && { opacity: 0.6 },
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
                  {isEditing && (
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
            <Text style={styles.hint}>You haven’t blocked anyone yet.</Text>
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

        {/* Guardado desde el top, no botón extra aquí */}
        <View style={{ height: 12 + insets.bottom }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
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

  hint: { color: '#6B7280', marginTop: 8, fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  addBtn: {
    backgroundColor: '#3A5985',
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
});
