import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AnimatedNearsyLogo from './auth/AnimatedNearsyLogo';
import { useAppTheme } from '../theme/ThemeContext';
import { fontWeight } from '../theme/typography';
import { duration, easing } from '../theme/motion';

const STARS = [
  { top: '15%', left: '20%', size: 3 },
  { top: '23%', left: '78%', size: 2 },
  { top: '11%', left: '66%', size: 2 },
  { top: '34%', left: '12%', size: 2 },
  { top: '40%', left: '86%', size: 3 },
];

function RadarPing({
  color,
  delay,
  reduceMotion,
}: {
  color: string;
  delay: number;
  reduceMotion: boolean;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration: duration.radarPing,
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
    loop.start();
    return () => loop.stop();
  }, [v, delay, reduceMotion]);
  return (
    <Animated.View
      style={[
        styles.ping,
        {
          borderColor: color,
          opacity: v.interpolate({
            inputRange: [0, 0.08, 1],
            outputRange: [0, 0.6, 0],
          }),
          transform: [
            {
              scale: v.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 2.9],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/**
 * WelcomeHero — uses the same AnimatedNearsyLogo as Login (no SVG / no alternate mark).
 */
export function WelcomeHero({
  reduceMotion = false,
}: {
  reduceMotion?: boolean;
}) {
  const { palette, theme } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const float = useRef(new Animated.Value(0)).current;
  const heroHeight = Math.max(320, Math.min(430, windowHeight * 0.48));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: duration.illustrationFloat / 2,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: duration.illustrationFloat / 2,
          easing: easing.inOut,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reduceMotion]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });
  const heroColors: readonly [string, string] =
    theme === 'dark' ? ['#1B3565', '#0A1330'] : ['#EAF4FD', '#EAF4FD'];
  const fadeColors: readonly [string, string, string] =
    theme === 'dark'
      ? ['rgba(12,25,54,0)', 'rgba(12,25,54,0.85)', '#0C1936']
      : ['rgba(234,244,253,0)', 'rgba(255,255,255,0.8)', '#FFFFFF'];

  return (
    <View style={[styles.hero, { height: heroHeight }]}>
      <LinearGradient colors={[...heroColors]} style={StyleSheet.absoluteFill} />

      {STARS.map((s, i) => (
        <View
          key={i}
          style={[
            styles.star,
            {
              top: s.top as `${number}%`,
              left: s.left as `${number}%`,
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              backgroundColor: palette.heroStar,
            },
          ]}
        />
      ))}

      <View style={styles.pingWrap} pointerEvents="none">
        {[0, 1200, 2400, 3600].map((d) => (
          <RadarPing
            key={d}
            color={palette.heroRing}
            delay={d}
            reduceMotion={reduceMotion}
          />
        ))}
      </View>

      <View style={styles.brand}>
        <AnimatedNearsyLogo size={46} />
        <Text style={[styles.wordmark, { color: palette.wordmark }]}>
          Nearsy
        </Text>
        <Text style={[styles.tagline, { color: palette.tagline }]}>
          Discover interesting people around you
        </Text>
      </View>

      <View style={styles.illustrationWrap}>
        <View style={[styles.floorGlow, { backgroundColor: palette.floorGlow }]} />
        <View
          style={[
            styles.groundRing,
            styles.groundRingOuter,
            { borderColor: palette.groundRing },
          ]}
        />
        <View
          style={[
            styles.groundRing,
            styles.groundRingInner,
            { borderColor: palette.groundRing },
          ]}
        />
        <Animated.Image
          source={require('../assets/people-illustration.png')}
          resizeMode="contain"
          accessibilityLabel="People nearby"
          style={[styles.illustration, { transform: [{ translateY }] }]}
        />
      </View>

      <LinearGradient
        colors={[...fadeColors]}
        locations={[0, 0.7, 1]}
        style={styles.heroFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 20,
  },
  star: { position: 'absolute' },
  pingWrap: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ping: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1.5,
  },
  brand: { alignItems: 'center', zIndex: 1 },
  wordmark: {
    fontSize: 30,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    marginTop: 6,
  },
  tagline: { fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  illustrationWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 34,
  },
  floorGlow: {
    position: 'absolute',
    bottom: 8,
    width: 300,
    height: 150,
    borderRadius: 150,
    opacity: 0.9,
  },
  groundRing: { position: 'absolute', bottom: 6, borderWidth: 1 },
  groundRingOuter: { width: 236, height: 236, borderRadius: 118 },
  groundRingInner: { width: 164, height: 164, borderRadius: 82 },
  illustration: { width: 236, height: 150 },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
  },
});
