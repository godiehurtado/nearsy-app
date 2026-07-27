import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import AnimatedNearsyLogo from './auth/AnimatedNearsyLogo';
import { useAppTheme } from '../theme/ThemeContext';
import { fontWeight } from '../theme/typography';
import { duration, easing } from '../theme/motion';
import { useTranslation } from '../i18n';

/**
 * Shared auth brand block — single source for Login + Welcome:
 * compact AnimatedNearsyLogo (subtle bloom + ephemeral waves),
 * wordmark, tagline, people illustration.
 */
export function NearsyBrandHero() {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled || reduce) return;
        loop = Animated.loop(
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
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [float]);

  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -5],
  });

  return (
    <View style={styles.hero}>
      <View style={styles.brand}>
        <AnimatedNearsyLogo
          size={46}
          bloom="subtle"
          layoutDensity="compact"
        />
        <Text style={[styles.wordmark, { color: palette.wordmark }]}>
          {t('common.appName')}
        </Text>
        <Text style={[styles.tagline, { color: palette.tagline }]}>
          {t('authentication.login.tagline')}
        </Text>
      </View>

      <Animated.Image
        source={require('../assets/people-illustration.png')}
        resizeMode="contain"
        accessibilityLabel={t('authentication.login.tagline')}
        style={[styles.illustration, { transform: [{ translateY }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    overflow: 'visible',
  },
  brand: {
    alignItems: 'center',
    overflow: 'visible',
  },
  wordmark: {
    fontSize: 30,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  tagline: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  illustration: {
    width: 236,
    height: 150,
    marginTop: 14,
    backgroundColor: 'transparent',
  },
});
