import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { introNodeEntryDelayMs } from './interestsIntroMotion';

const NODES = [
  { x: -54, y: -30, icon: 'musical-notes-outline' as const, color: '#7C3AED' },
  { x: 52, y: -36, icon: 'restaurant-outline' as const, color: '#EA580C' },
  { x: 44, y: 42, icon: 'bicycle-outline' as const, color: '#059669' },
  { x: -48, y: 40, icon: 'earth-outline' as const, color: '#0891B2' },
] as const;

const RING_BREATHE_MS = 4200;
const CENTER_ENTRY_MS = 480;

function DecorativeNode({
  icon,
  color,
  offset,
  progress,
  fill,
}: {
  icon: (typeof NODES)[number]['icon'];
  color: string;
  offset: { x: number; y: number };
  progress: SharedValue<number>;
  fill: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.86 + progress.value * 0.14 }],
    marginTop: offset.y - 13 - (1 - progress.value) * 5,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.node,
        {
          marginLeft: offset.x - 13,
          backgroundColor: fill,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name={icon} size={14} color={color} />
    </Animated.View>
  );
}

function RadarRing({
  size,
  color,
  progress,
}: {
  size: number;
  color: string;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + progress.value * 0.16,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        animatedStyle,
      ]}
    />
  );
}

/** Non-interactive proximity visual for Interests Intro. Not a chip selector. */
export function InterestsIntroVisual() {
  const { palette } = useAppTheme();
  const reduceMotion = useReducedMotion();

  const centerScale = useSharedValue(reduceMotion ? 1 : 0.94);
  const centerOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const ringPulse = useSharedValue(reduceMotion ? 1 : 0);
  const node0 = useSharedValue(reduceMotion ? 1 : 0);
  const node1 = useSharedValue(reduceMotion ? 1 : 0);
  const node2 = useSharedValue(reduceMotion ? 1 : 0);
  const node3 = useSharedValue(reduceMotion ? 1 : 0);
  const nodeProgress = [node0, node1, node2, node3];

  useEffect(() => {
    if (reduceMotion) {
      centerScale.value = 1;
      centerOpacity.value = 1;
      ringPulse.value = 1;
      nodeProgress.forEach((value) => {
        value.value = 1;
      });
      return;
    }

    centerScale.value = withTiming(1, {
      duration: CENTER_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
    centerOpacity.value = withTiming(1, {
      duration: CENTER_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
    nodeProgress.forEach((value, index) => {
      value.value = withDelay(
        introNodeEntryDelayMs(index),
        withSpring(1, { damping: 16, stiffness: 210 }),
      );
    });
    ringPulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: RING_BREATHE_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: RING_BREATHE_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
  }, [
    centerOpacity,
    centerScale,
    node0,
    node1,
    node2,
    node3,
    reduceMotion,
    ringPulse,
  ]);

  const centerStyle = useAnimatedStyle(() => ({
    opacity: centerOpacity.value,
    transform: [{ scale: centerScale.value }],
  }));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.wrap}
    >
      <RadarRing size={148} color={palette.primary} progress={ringPulse} />
      <RadarRing size={110} color={palette.accentBorder} progress={ringPulse} />
      <RadarRing size={78} color={palette.primaryLight} progress={ringPulse} />

      {NODES.map((node, index) => (
        <DecorativeNode
          key={node.icon}
          icon={node.icon}
          color={node.color}
          offset={{ x: node.x, y: node.y }}
          progress={nodeProgress[index]!}
          fill={palette.panel}
        />
      ))}

      <Animated.View
        style={[
          styles.center,
          {
            backgroundColor: palette.panel,
            borderColor: palette.accentBorder,
          },
          centerStyle,
        ]}
      >
        <Ionicons name="people-outline" size={26} color={palette.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderWidth: 1,
  },
  center: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  node: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
