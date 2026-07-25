import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { duration, easing } from '../theme/motion';

interface Props {
  /** Changing this key remounts/replays the circular reveal. */
  sweepKey: string;
  colors: readonly string[];
  locations?: readonly number[];
  reduceMotion?: boolean;
  style?: ViewStyle;
}

/**
 * ThemeSweep — circular reveal approximation (scale + round clip).
 * Always plays a full reveal when sweepKey changes (caller remounts via key).
 * Caller must keep a solid previous-theme base underneath so Pearl Dawn
 * never flashes between Light ↔ Dark.
 */
export function ThemeSweep({
  sweepKey,
  colors,
  locations,
  reduceMotion = false,
  style,
}: Props) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: reduceMotion ? 0 : duration.themeSweep,
      easing: easing.sweep,
      useNativeDriver: true,
    }).start();
  }, [sweepKey, t, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        style,
        { borderRadius: 9999, overflow: 'hidden' },
        {
          opacity: t.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [1, 1, 1],
          }),
          transform: [
            { translateY: -100 },
            {
              scale: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0.02, 3.2],
              }),
            },
            { translateY: 100 },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={[...colors] as [string, string, ...string[]]}
        locations={
          locations
            ? ([...locations] as [number, number, ...number[]])
            : undefined
        }
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
