// Animated Nearsy branding logo for the Dark Login (TS-005A / PR-005B).
// Visual-only: a static outlined pin whose single centered eye (a broken ring)
// rotates in place, with a softly pulsing glow and subtle expanding rings.
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { authColors } from '../../theme/authTokens';

type Props = {
  /** Diameter of the pin glyph. The surrounding glow/rings scale from this. */
  size?: number;
};

const PIN_COLOR = '#8FCBFF';
const INNER_BRIGHT = '#DFF1FF';

// Timing derived from the approved recording.
const ROTATION_MS = 4000; // internal curved element: one slow revolution
const GLOW_MS = 2400; // glow breathe (reversing)
const RING_MS = 3200; // ring expand + fade
const RING_STAGGER_MS = 1600; // second ring offset for a staggered pulse

export default function AnimatedNearsyLogo({ size = 46 }: Props) {
  const reduceMotion = useReducedMotion();

  const rotation = useSharedValue(0);
  const glow = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  const glowSize = Math.round(size * 2.09);
  // Teardrop head diameter and the single centered eye diameter.
  const headSize = Math.round(size * 0.72);
  const eyeSize = Math.round(size * 0.34);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      glow.value = 0.6;
      ring1.value = 0;
      ring2.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(1, { duration: ROTATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    glow.value = withRepeat(
      withTiming(1, { duration: GLOW_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    ring1.value = withRepeat(
      withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    ring2.value = withDelay(
      RING_STAGGER_MS,
      withRepeat(
        withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(glow);
      cancelAnimation(ring1);
      cancelAnimation(ring2);
    };
  }, [reduceMotion, glow, ring1, ring2, rotation]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.45, 0.9]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.12]) }],
  }));

  // Rotation only — the eye spins around its own geometric center, in place.
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring1.value, [0, 0.15, 1], [0, 0.35, 0]),
    transform: [{ scale: interpolate(ring1.value, [0, 1], [0.55, 1.25]) }],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring2.value, [0, 0.15, 1], [0, 0.28, 0]),
    transform: [{ scale: interpolate(ring2.value, [0, 1], [0.55, 1.4]) }],
  }));

  return (
    <View
      style={[styles.container, { width: glowSize, height: glowSize }]}
      pointerEvents="none"
    >
      <Animated.View style={[styles.layer, ring2Style]}>
        <View
          style={[
            styles.ring,
            {
              width: glowSize,
              height: glowSize,
              borderRadius: glowSize / 2,
            },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.layer, ring1Style]}>
        <View
          style={[
            styles.ring,
            {
              width: glowSize * 0.82,
              height: glowSize * 0.82,
              borderRadius: (glowSize * 0.82) / 2,
            },
          ]}
        />
      </Animated.View>

      <Animated.View style={[styles.layer, glowStyle]}>
        <View
          style={[
            styles.glow,
            {
              width: glowSize * 0.86,
              height: glowSize * 0.86,
              borderRadius: (glowSize * 0.86) / 2,
            },
          ]}
        />
      </Animated.View>

      <View style={styles.layer}>
        <View style={[styles.pin, { width: headSize, height: headSize }]} />
      </View>

      <View style={styles.layer}>
        <Animated.View
          style={[
            styles.eye,
            {
              width: eyeSize,
              height: eyeSize,
              borderRadius: eyeSize / 2,
            },
            eyeStyle,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    backgroundColor: authColors.logoGlow,
  },
  ring: {
    borderWidth: 1,
    borderColor: 'rgba(102,153,255,0.35)',
  },
  // Teardrop location-pin outline (no built-in eye): a rounded square with a
  // single sharp corner, rotated 45deg so the point faces down. Its geometric
  // center coincides with the head circle center and the layer center.
  pin: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: PIN_COLOR,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 0,
    transform: [{ rotate: '45deg' }],
  },
  // Single centered eye: a broken ring (gap on one side) that rotates in place.
  eye: {
    borderWidth: 2,
    borderTopColor: INNER_BRIGHT,
    borderRightColor: INNER_BRIGHT,
    borderBottomColor: INNER_BRIGHT,
    borderLeftColor: 'transparent',
  },
});
