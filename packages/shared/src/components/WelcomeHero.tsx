import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NearsyBrandHero } from './NearsyBrandHero';
import { useAppTheme } from '../theme/ThemeContext';

/**
 * WelcomeHero — Welcome brand block.
 * Uses the same NearsyBrandHero as Login (logo, waves, people).
 * No ambient bloom, radar pings, ground rings, or floor glow.
 */
export function WelcomeHero(_props?: { reduceMotion?: boolean }) {
  const insets = useSafeAreaInsets();
  const { theme, palette } = useAppTheme();
  // Match Login screen surface behind the shared brand block.
  const screenBg = theme === 'dark' ? palette.background : palette.heroBg;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: screenBg,
          // Nudge the full brand block slightly down for visual centering
          // (Login uses insets.top + 12; Welcome sits a bit higher without this).
          paddingTop: insets.top + 28,
        },
      ]}
    >
      <NearsyBrandHero />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'visible',
  },
});
