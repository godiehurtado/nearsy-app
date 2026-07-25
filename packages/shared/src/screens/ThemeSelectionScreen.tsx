import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  AccessibilityInfo,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { ProximityOrb } from '../components/ProximityOrb';
import { ThemeSweep } from '../components/ThemeSweep';
import { AppearanceToggle } from '../components/AppearanceToggle';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { pearlDawn, ThemeName } from '../theme/colors';
import { fontSize, fontWeight } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'ThemeSelection'>;

const CLEAR_SWEEP = ['#FFFFFF', '#E4EFFC', '#CFE0F7'] as const;
const DARK_SWEEP = ['#1B3565', '#0A1330', '#060E22'] as const;

function sweepColors(t: ThemeName) {
  return t === 'clear' ? CLEAR_SWEEP : DARK_SWEEP;
}

/**
 * Screen: Theme Selection (first run only)
 * Pearl Dawn is NOT a third theme — only the no-selection state.
 */
export default function ThemeSelectionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { commitTheme, previewTheme } = useAppTheme();
  const [selected, setSelected] = useState<ThemeName | null>(null);
  /** Solid previous theme under the sweep — prevents Pearl Dawn flash. */
  const [baseTheme, setBaseTheme] = useState<ThemeName | null>(null);
  const [sweepNonce, setSweepNonce] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Read only — never used as a default selection (approved behaviour).
  useColorScheme();

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  const text =
    selected === 'clear'
      ? '#12203D'
      : selected === 'dark'
        ? '#EAF1FF'
        : pearlDawn.text;
  const muted =
    selected === 'clear'
      ? '#5C6B85'
      : selected === 'dark'
        ? '#9DAFD2'
        : pearlDawn.muted;

  function pick(t: ThemeName) {
    if (selected !== null && selected !== t) {
      setBaseTheme(selected);
    }
    setSelected(t);
    setSweepNonce((n) => n + 1);
    previewTheme(t);
  }

  async function onContinue() {
    if (!selected) return;
    await commitTheme(selected);
    navigation.replace('Welcome');
  }

  return (
    <View style={styles.root}>
      <StatusBar style={selected === 'dark' ? 'light' : 'dark'} />

      <LinearGradient
        colors={[...pearlDawn.gradient]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {selected === null ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.bloom,
              styles.bloomWarm,
              { backgroundColor: pearlDawn.bloomWarm },
            ]}
          />
          <View
            style={[
              styles.bloom,
              styles.bloomCool,
              { backgroundColor: pearlDawn.bloomCool },
            ]}
          />
          <View style={[styles.veil, { backgroundColor: pearlDawn.veil }]} />
        </View>
      ) : (
        <>
          {baseTheme ? (
            <LinearGradient
              colors={[...sweepColors(baseTheme)]}
              locations={[0, 0.58, 1]}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <ThemeSweep
            key={`${selected}-${sweepNonce}`}
            sweepKey={`${selected}-${sweepNonce}`}
            reduceMotion={reduceMotion}
            colors={[...sweepColors(selected)]}
            locations={[0, 0.58, 1]}
          />
        </>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 20) + 24,
            paddingBottom: Math.max(insets.bottom, 20) + 24,
          },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: muted }]}>
            WELCOME TO NEARSY
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: text }]}
          >
            Set the mood
          </Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Choose how Nearsy looks. You can change it later in your profile.
          </Text>
        </View>

        <View style={styles.orbWrap}>
          <ProximityOrb theme={selected} reduceMotion={reduceMotion} />
        </View>

        <View style={styles.toggleWrap}>
          <AppearanceToggle value={selected} onChange={pick} />
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            onPress={onContinue}
            disabled={!selected}
            disabledReason={
              !selected ? 'Choose Light or Dark to continue' : undefined
            }
          />
          {selected ? (
            <Text style={[styles.hint, { color: muted }]}>
              You can switch any time before continuing
            </Text>
          ) : (
            <View style={styles.blocked} accessibilityElementsHidden>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={muted}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 26,
    justifyContent: 'space-between',
    gap: 20,
  },
  bloom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  bloomWarm: { top: -40, left: -70 },
  bloomCool: { top: -40, right: -70 },
  veil: {
    position: 'absolute',
    bottom: -90,
    alignSelf: 'center',
    width: 380,
    height: 300,
    borderRadius: 190,
    opacity: 0.85,
  },
  header: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 2.4,
    textAlign: 'center',
  },
  title: {
    fontSize: 29,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    paddingVertical: 8,
  },
  toggleWrap: {
    alignItems: 'center',
    width: '100%',
  },
  footer: {
    alignItems: 'stretch',
    gap: 13,
    width: '100%',
  },
  hint: {
    fontSize: 11.5,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  blocked: { alignItems: 'center' },
});
