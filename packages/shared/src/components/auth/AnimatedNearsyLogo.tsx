// Official Nearsy mark for auth heroes (Welcome / Login / ProfileCompletion).
// View-based pin + rotating locator arc (no SVG dependency).
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
import { useAppTheme } from '../../theme/ThemeContext';
import { duration } from '../../theme/motion';

type Props = {
  /** Diameter of the pin glyph. */
  size?: number;
  /**
   * Soft light behind the mark.
   * - ambient: soft bloom disc (Welcome / ProfileCompletion)
   * - subtle: diffuse light + ephemeral expanding waves (Login) — no permanent ring/disc
   */
  bloom?: 'ambient' | 'subtle';
  /**
   * Layout box in the document flow.
   * - default: box matches ambient halo (Welcome / ProfileCompletion)
   * - compact: box hugs the mark; decorative waves paint in an absolute overlay (Login)
   */
  layoutDensity?: 'default' | 'compact';
};

const ROTATION_MS = 1800;
const GLOW_MS = 2800;
const WAVE_MS = 3200;
const WAVE_STAGGER_MS = 1600;

export default function AnimatedNearsyLogo({
  size = 46,
  bloom = 'ambient',
  layoutDensity = 'default',
}: Props) {
  const reduceMotion = useReducedMotion();
  const { palette } = useAppTheme();
  const compact = layoutDensity === 'compact';
  const withWaves = bloom === 'subtle';

  const rotation = useSharedValue(0);
  const glow = useSharedValue(0.55);
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);

  const headSize = Math.round(size * 0.72);
  const eyeSize = Math.round(size * 0.34);
  const ambientHalo = Math.round(size * 2.09);
  const subtleCore = Math.round(size * 0.55);

  // Flow box: compact hugs the mark so wordmark can sit closer.
  const layoutBox = compact
    ? Math.round(size * 1.05)
    : bloom === 'ambient'
      ? ambientHalo
      : Math.round(size * 1.15);

  // Decorative wave canvas (absolute) — larger than before, outside flow.
  const waveBase = Math.round(size * 3.6);
  const waveCanvas = Math.round(size * 5.6);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      glow.value = 0.65;
      wave1.value = 0;
      wave2.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(1, { duration: ROTATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    glow.value = withRepeat(
      withTiming(1, {
        duration: bloom === 'subtle' ? duration.glowBreathe : GLOW_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );

    if (withWaves) {
      wave1.value = 0;
      wave2.value = 0;
      wave1.value = withRepeat(
        withTiming(1, { duration: WAVE_MS, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      wave2.value = withDelay(
        WAVE_STAGGER_MS,
        withRepeat(
          withTiming(1, { duration: WAVE_MS, easing: Easing.out(Easing.ease) }),
          -1,
          false,
        ),
      );
    }

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(glow);
      cancelAnimation(wave1);
      cancelAnimation(wave2);
    };
  }, [reduceMotion, bloom, withWaves, glow, rotation, wave1, wave2]);

  const ambientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.35, 0.72]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.96, 1.04]) }],
  }));

  // Living light — soft core only; never a hard outer disc.
  const subtleGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.2, 0.55]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.92, 1.08]) }],
  }));

  const eyeBrightnessStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.7, 1]),
  }));

  const locatorStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  // Ephemeral waves: invisible at rest → expand farther → fully gone.
  const wave1Style = useAnimatedStyle(() => ({
    opacity: interpolate(wave1.value, [0, 0.1, 0.5, 1], [0, 0.26, 0.1, 0]),
    transform: [
      { scale: interpolate(wave1.value, [0, 1], [0.28, 1.55]) },
    ],
  }));

  const wave2Style = useAnimatedStyle(() => ({
    opacity: interpolate(wave2.value, [0, 0.1, 0.5, 1], [0, 0.2, 0.08, 0]),
    transform: [
      { scale: interpolate(wave2.value, [0, 1], [0.28, 1.7]) },
    ],
  }));

  return (
    <View
      style={[styles.container, { width: layoutBox, height: layoutBox }]}
      pointerEvents="none"
    >
      {withWaves ? (
        <View
          style={[
            styles.waveCanvas,
            {
              width: waveCanvas,
              height: waveCanvas,
              marginLeft: -waveCanvas / 2,
              marginTop: -waveCanvas / 2,
            },
          ]}
        >
          <Animated.View style={[styles.layer, wave2Style]}>
            <View
              style={{
                width: waveBase,
                height: waveBase,
                borderRadius: waveBase / 2,
                borderWidth: 1,
                borderColor: palette.logoAccent,
                backgroundColor: 'transparent',
              }}
            />
          </Animated.View>
          <Animated.View style={[styles.layer, wave1Style]}>
            <View
              style={{
                width: waveBase * 0.82,
                height: waveBase * 0.82,
                borderRadius: (waveBase * 0.82) / 2,
                borderWidth: 1,
                borderColor: palette.logoStroke,
                backgroundColor: 'transparent',
              }}
            />
          </Animated.View>
        </View>
      ) : null}

      {bloom === 'subtle' ? (
        <Animated.View style={[styles.layer, subtleGlowStyle]}>
          <View
            style={{
              width: subtleCore,
              height: subtleCore,
              borderRadius: subtleCore / 2,
              backgroundColor: palette.heroGlow,
            }}
          />
        </Animated.View>
      ) : (
        <>
          <Animated.View style={[styles.layer, ambientStyle]}>
            <View
              style={{
                width: ambientHalo,
                height: ambientHalo,
                borderRadius: ambientHalo / 2,
                backgroundColor: palette.heroGlow,
              }}
            />
          </Animated.View>
          <Animated.View style={[styles.layer, ambientStyle]}>
            <View
              style={{
                width: ambientHalo * 0.72,
                height: ambientHalo * 0.72,
                borderRadius: (ambientHalo * 0.72) / 2,
                backgroundColor: palette.heroGlow,
              }}
            />
          </Animated.View>
        </>
      )}

      {/* Location pin */}
      <View style={styles.layer}>
        <View
          style={[
            styles.pin,
            { width: headSize, height: headSize, borderColor: palette.logoStroke },
          ]}
        />
      </View>

      {/* Locator circle (part of the mark) + luminous rotating arc */}
      <View style={styles.layer}>
        <View
          style={{
            width: eyeSize,
            height: eyeSize,
            borderRadius: eyeSize / 2,
            borderWidth: 1.5,
            borderColor: palette.logoStroke,
            backgroundColor: 'transparent',
          }}
        />
      </View>
      <View style={styles.layer}>
        <Animated.View
          style={[
            {
              width: eyeSize,
              height: eyeSize,
              borderRadius: eyeSize / 2,
              borderWidth: 1.5,
              borderTopColor: palette.logoAccent,
              borderRightColor: palette.logoAccent,
              borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
            },
            locatorStyle,
            bloom === 'subtle' ? eyeBrightnessStyle : null,
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
    overflow: 'visible',
  },
  waveCanvas: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    borderBottomLeftRadius: 999,
    borderBottomRightRadius: 0,
    transform: [{ rotate: '45deg' }],
  },
});
