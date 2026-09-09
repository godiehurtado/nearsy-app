import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';
import { useTranslation } from '../../i18n/index.ts';
import {
  type OnboardingSelectedInterest,
} from '../../interests/onboardingInterestCatalog.ts';
import { celebrationEntryDelayMs, celebrationNextUpDelayMs } from './celebrationMotion.ts';

/** I6 can switch this to route into Affiliations without redesigning the screen. */
export type InterestsCelebrationContinueTarget = 'location' | 'affiliations';

type Props = {
  selected: OnboardingSelectedInterest[];
  /** Reserved for I6 — I5 continues to Location from ProfileCompletionScreen. */
  continueTarget?: InterestsCelebrationContinueTarget;
};

const BADGE_OFFSETS = [
  { x: -72, y: -8 },
  { x: -36, y: -48 },
  { x: 36, y: -48 },
  { x: 72, y: -8 },
  { x: 48, y: 32 },
  { x: -48, y: 32 },
] as const;

const HALO_ENTRY_MS = 520;
const MARK_DELAY_MS = 180;
const BREATHE_MS = 5400;
const MAX_BADGES = 6;

function CelebrationIconBadge({
  item,
  offset,
  progress,
  panelColor,
  borderColor,
}: {
  item: OnboardingSelectedInterest;
  offset: { x: number; y: number };
  progress: SharedValue<number>;
  panelColor: string;
  borderColor: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.84 + progress.value * 0.16 }],
    marginTop: offset.y - 17 - (1 - progress.value) * 6,
  }));

  return (
    <Animated.View
      style={[
        styles.iconBadge,
        {
          marginLeft: offset.x - 17,
          backgroundColor: panelColor,
          borderColor,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name={item.icon as any} size={18} color={item.iconColor} />
    </Animated.View>
  );
}

export function InterestsCelebrationStep({ selected }: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  const iconBadges = useMemo(
    () =>
      selected
        .filter((s) => !s.id.endsWith('_other'))
        .slice(0, MAX_BADGES)
        .map((item, index) => ({
          item,
          offset: BADGE_OFFSETS[index % BADGE_OFFSETS.length]!,
          index,
        })),
    [selected],
  );

  const haloScale = useSharedValue(reduceMotion ? 1 : 0.94);
  const haloOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const markScale = useSharedValue(reduceMotion ? 1 : 0.72);
  const markOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const breathe = useSharedValue(0);
  const badge0 = useSharedValue(reduceMotion ? 1 : 0);
  const badge1 = useSharedValue(reduceMotion ? 1 : 0);
  const badge2 = useSharedValue(reduceMotion ? 1 : 0);
  const badge3 = useSharedValue(reduceMotion ? 1 : 0);
  const badge4 = useSharedValue(reduceMotion ? 1 : 0);
  const badge5 = useSharedValue(reduceMotion ? 1 : 0);
  const badgeProgress = [badge0, badge1, badge2, badge3, badge4, badge5];
  const nextUpOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const nextUpTranslateY = useSharedValue(reduceMotion ? 0 : 8);

  useEffect(() => {
    if (reduceMotion) {
      haloScale.value = 1;
      haloOpacity.value = 1;
      markScale.value = 1;
      markOpacity.value = 1;
      badgeProgress.forEach((value) => {
        value.value = 1;
      });
      nextUpOpacity.value = 1;
      nextUpTranslateY.value = 0;
      return;
    }

    haloScale.value = withTiming(1, {
      duration: HALO_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
    haloOpacity.value = withTiming(1, {
      duration: HALO_ENTRY_MS,
      easing: Easing.out(Easing.cubic),
    });
    markScale.value = withDelay(
      MARK_DELAY_MS,
      withSpring(1, { damping: 14, stiffness: 180 }),
    );
    markOpacity.value = withDelay(
      MARK_DELAY_MS,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
    badgeProgress.forEach((value, index) => {
      value.value = withDelay(
        celebrationEntryDelayMs(index),
        withSpring(1, { damping: 16, stiffness: 210 }),
      );
    });
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: BREATHE_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: BREATHE_MS / 2,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      false,
    );
    nextUpOpacity.value = withDelay(
      celebrationNextUpDelayMs(),
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
    nextUpTranslateY.value = withDelay(
      celebrationNextUpDelayMs(),
      withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
  }, [
    badge0,
    badge1,
    badge2,
    badge3,
    badge4,
    badge5,
    badgeProgress,
    breathe,
    haloOpacity,
    haloScale,
    markOpacity,
    markScale,
    nextUpOpacity,
    nextUpTranslateY,
    reduceMotion,
  ]);

  const haloAnimatedStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value * (0.82 + breathe.value * 0.18),
    transform: [{ scale: haloScale.value * (1 + breathe.value * 0.04) }],
  }));

  const markAnimatedStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const nextUpAnimatedStyle = useAnimatedStyle(() => ({
    opacity: nextUpOpacity.value,
    transform: [{ translateY: nextUpTranslateY.value }],
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.haloWrap}>
        <Animated.View
          style={[
            styles.haloOuter,
            { backgroundColor: palette.primaryLight },
            haloAnimatedStyle,
          ]}
        />
        <View
          style={[styles.haloRing, { borderColor: palette.accentBorder }]}
        />
        {iconBadges.map(({ item, offset, index }) => (
          <CelebrationIconBadge
            key={item.id}
            item={item}
            offset={offset}
            progress={badgeProgress[index]!}
            panelColor={palette.panel}
            borderColor={palette.accentBorder}
          />
        ))}
        <Animated.View
          style={[
            styles.markCircle,
            markAnimatedStyle,
            {
              borderColor: palette.accentBorder,
              backgroundColor: palette.panel,
            },
          ]}
        >
          <Ionicons name="checkmark" size={30} color={palette.primaryLight} />
        </Animated.View>
      </View>

      <Text style={[styles.eyebrow, { color: palette.textMuted }]}>
        {t('onboarding.profileCompletion.interestsCelebration.eyebrow')}
      </Text>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {t('onboarding.profileCompletion.interestsCelebration.title')}
      </Text>
      <Text style={[styles.body, { color: palette.textSecondary }]}>
        {t('onboarding.profileCompletion.interestsCelebration.body')}
      </Text>

      <Animated.View style={[styles.nextUp, nextUpAnimatedStyle]}>
        <View style={[styles.rule, { backgroundColor: palette.border }]} />

        <Text style={[styles.nextEyebrow, { color: palette.textMuted }]}>
          {t('onboarding.profileCompletion.interestsCelebration.nextEyebrow')}
        </Text>
        <Text style={[styles.nextTitle, { color: palette.textPrimary }]}>
          {t('onboarding.profileCompletion.interestsCelebration.nextTitle')}
        </Text>
        <Text style={[styles.nextBody, { color: palette.textSecondary }]}>
          {t('onboarding.profileCompletion.interestsCelebration.nextBody')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  haloWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  haloOuter: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 66,
  },
  haloRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
  },
  markCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 30,
    maxWidth: 320,
  },
  body: {
    fontSize: fontSize.base - 0.5,
    lineHeight: (fontSize.base - 0.5) * 1.6,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  nextUp: {
    width: '100%',
    alignItems: 'center',
  },
  rule: {
    height: 1,
    width: 64,
    marginVertical: spacing.lg,
  },
  nextEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  nextTitle: {
    fontSize: 19,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
    letterSpacing: -0.2,
    lineHeight: 24,
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  nextBody: {
    fontSize: fontSize.base - 0.5,
    lineHeight: (fontSize.base - 0.5) * 1.6,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 290,
  },
});
