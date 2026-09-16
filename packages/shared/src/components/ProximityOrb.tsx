import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pearlDawn, ThemeName } from '../theme/colors';
import { duration, easing } from '../theme/motion';

interface Props {
  /** null renders the neutral Pearl Dawn state: sun and moon at equal weight. */
  theme: ThemeName | null;
  size?: number;
  reduceMotion?: boolean;
}

const T = {
  none: {
    ring: pearlDawn.ring,
    glow: 'rgba(255,255,255,0.95)',
    orb: pearlDawn.orb,
    orbBorder: pearlDawn.orbBorder,
    shadow: pearlDawn.shadow,
  },
  clear: {
    ring: [
      'rgba(78,119,199,0.16)',
      'rgba(78,119,199,0.26)',
      'rgba(78,119,199,0.5)',
    ] as const,
    glow: 'rgba(255,213,138,0.5)',
    orb: '#FFFFFF',
    orbBorder: '#E2ECFA',
    shadow: 'rgba(28,58,110,0.18)',
  },
  dark: {
    ring: [
      'rgba(91,170,255,0.14)',
      'rgba(91,170,255,0.24)',
      'rgba(91,170,255,0.5)',
    ] as const,
    glow: 'rgba(91,170,255,0.34)',
    orb: '#152A56',
    orbBorder: '#2C4680',
    shadow: 'rgba(0,0,0,0.5)',
  },
};

/**
 * ProximityOrb — concentric radar rings + breathing glow + swappable glyph.
 * Glyphs use Ionicons (same vector font already proven on iOS Login) so they
 * render without react-native-svg / a native rebuild.
 */
export function ProximityOrb({
  theme,
  size = 250,
  reduceMotion = false,
}: Props) {
  const tok = T[theme ?? 'none'];
  const breathe = useRef(new Animated.Value(0)).current;
  const ping1 = useRef(new Animated.Value(0)).current;
  const ping2 = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: duration.glowBreathe / 2,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: duration.glowBreathe / 2,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || !theme) return;
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 3600,
            easing: easing.out,
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    const a = mk(ping1, 0);
    const b = mk(ping2, 1800);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ping1, ping2, theme, reduceMotion]);

  useEffect(() => {
    swap.setValue(0.72);
    Animated.timing(swap, {
      toValue: 1,
      duration: reduceMotion ? 0 : duration.orbSwap,
      easing: easing.orb,
      useNativeDriver: true,
    }).start();
  }, [theme, swap, reduceMotion]);

  const inner = size * 0.296;
  const mid = size * 0.648;
  const glowSize = size * 0.52;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { width: size, height: size }]}
    >
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: tok.ring[0],
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: mid,
            height: mid,
            borderRadius: mid / 2,
            borderColor: tok.ring[1],
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            borderWidth: 1.5,
            borderColor: tok.ring[2],
          },
        ]}
      />

      {theme && !reduceMotion
        ? [ping1, ping2].map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.ring,
                {
                  width: inner,
                  height: inner,
                  borderRadius: inner / 2,
                  borderWidth: 1.5,
                  borderColor: tok.ring[2],
                  opacity: v.interpolate({
                    inputRange: [0, 0.1, 1],
                    outputRange: [0, 0.5, 0],
                  }),
                  transform: [
                    {
                      scale: v.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.7],
                      }),
                    },
                  ],
                },
              ]}
            />
          ))
        : null}

      <Animated.View
        style={[
          styles.glow,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: tok.glow,
            opacity: breathe.interpolate({
              inputRange: [0, 1],
              outputRange: [0.42, 0.76],
            }),
            transform: [
              {
                scale: breathe.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.06],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.orb,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: tok.orb,
            borderColor: tok.orbBorder,
            shadowColor: tok.shadow,
            transform: [{ scale: swap }],
          },
        ]}
      >
        {theme === null ? (
          <View style={styles.glyphPair}>
            <Ionicons name="sunny-outline" size={24} color={pearlDawn.glyph} />
            <Ionicons name="moon-outline" size={24} color={pearlDawn.glyph} />
          </View>
        ) : theme === 'clear' ? (
          <Ionicons name="sunny" size={34} color="#E0A33C" />
        ) : (
          <Ionicons name="moon" size={34} color="#BFD8FF" />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1 },
  glow: { position: 'absolute' },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    borderWidth: 1,
    shadowOpacity: 1,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  glyphPair: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
