import React, { useEffect, useRef } from 'react';
import { View, Pressable, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pearlDawn, ThemeName } from '../theme/colors';
import { fontSize, fontWeight } from '../theme/typography';
import { duration, easing } from '../theme/motion';

interface Props {
  /** null = no selection (first-run neutral state). No default is allowed. */
  value: ThemeName | null;
  onChange: (t: ThemeName) => void;
}

const TOKENS = {
  none: {
    track: pearlDawn.track,
    trackBorder: pearlDawn.trackBorder,
    shadow: pearlDawn.shadow,
    idleFg: pearlDawn.muted,
  },
  clear: {
    track: 'rgba(255,255,255,0.72)',
    trackBorder: '#DCE6F7',
    shadow: 'rgba(28,58,110,0.14)',
    idleFg: '#5C6B85',
  },
  dark: {
    track: 'rgba(19,35,73,0.72)',
    trackBorder: '#263F76',
    shadow: 'rgba(0,0,0,0.42)',
    idleFg: '#7E93BD',
  },
};

function CheckBadge({ bg, fg }: { bg: string; fg: string }) {
  const scale = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: duration.markIn,
      easing: easing.pop,
      useNativeDriver: true,
    }).start();
  }, [scale]);
  return (
    <Animated.View
      style={[styles.badge, { backgroundColor: bg, transform: [{ scale }] }]}
    >
      <Ionicons name="checkmark" size={11} color={fg} />
    </Animated.View>
  );
}

/**
 * AppearanceToggle — SegmentedToggle for Theme Selection.
 * Icons: Ionicons (same font family already used by Login on iOS).
 */
export function AppearanceToggle({ value, onChange }: Props) {
  const t = TOKENS[value ?? 'none'];
  const lightActive = value === 'clear';
  const darkActive = value === 'dark';

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Appearance"
      style={[
        styles.track,
        {
          backgroundColor: t.track,
          borderColor: t.trackBorder,
          shadowColor: t.shadow,
        },
      ]}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: lightActive }}
        accessibilityLabel="Light appearance"
        onPress={() => onChange('clear')}
        style={[
          styles.segment,
          lightActive
            ? { backgroundColor: '#FFFFFF', borderColor: '#4E77C7' }
            : styles.segmentIdle,
        ]}
      >
        <Ionicons
          name="sunny-outline"
          size={17}
          color={lightActive ? '#12203D' : t.idleFg}
        />
        <Text
          style={[
            styles.label,
            {
              color: lightActive ? '#12203D' : t.idleFg,
              fontWeight: lightActive
                ? fontWeight.extrabold
                : fontWeight.semibold,
            },
          ]}
        >
          Light
        </Text>
        {lightActive ? <CheckBadge bg="#2E5CC0" fg="#FFFFFF" /> : null}
      </Pressable>

      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: darkActive }}
        accessibilityLabel="Dark appearance"
        onPress={() => onChange('dark')}
        style={[
          styles.segment,
          darkActive
            ? { backgroundColor: '#2E5CC0', borderColor: '#5BAAFF' }
            : styles.segmentIdle,
        ]}
      >
        <Ionicons
          name="moon-outline"
          size={17}
          color={darkActive ? '#FFFFFF' : t.idleFg}
        />
        <Text
          style={[
            styles.label,
            {
              color: darkActive ? '#FFFFFF' : t.idleFg,
              fontWeight: darkActive
                ? fontWeight.extrabold
                : fontWeight.semibold,
            },
          ]}
        >
          Dark
        </Text>
        {darkActive ? <CheckBadge bg="#5BAAFF" fg="#0C1936" /> : null}
      </Pressable>
    </View>
  );
}

/** Alias matching sprint naming. */
export const ThemeSelector = AppearanceToggle;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'center',
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    maxWidth: '100%',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 46,
  },
  segmentIdle: { backgroundColor: 'transparent', borderColor: 'transparent' },
  label: { fontSize: fontSize.md, letterSpacing: -0.15 },
  badge: {
    width: 19,
    height: 19,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
