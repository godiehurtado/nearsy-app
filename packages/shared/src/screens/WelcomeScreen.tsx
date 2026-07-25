import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AccessibilityInfo,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { WelcomeHero } from '../components/WelcomeHero';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  AuthSocialButtonRow,
  AuthSocialProvider,
} from '../components/AuthSocialButtonRow';
import { useAppTheme } from '../theme/ThemeContext';
import { fontWeight } from '../theme/typography';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/**
 * Screen: Welcome
 * Social row reuses AuthSocialButtonRow — the same visual source as Login.
 */
export default function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);

  function onProvider(p: AuthSocialProvider) {
    // Navigation only this sprint — no Apple/Meta/LinkedIn auth.
    if (p === 'google') {
      navigation.navigate('Register');
    }
  }

  const socialLabels = {
    google: t('authentication.login.social.google'),
    apple: t('authentication.login.social.apple'),
    meta: t('authentication.login.social.meta'),
    linkedin: t('authentication.login.social.linkedin'),
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <WelcomeHero reduceMotion={reduceMotion} />

        <View style={[styles.card, { backgroundColor: palette.cardBg }]}>
          <PrimaryButton
            label="Create account"
            onPress={() => navigation.navigate('Register')}
          />

          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: palette.divider }]} />
            <Text style={[styles.dividerText, { color: palette.dividerText }]}>
              or continue with
            </Text>
            <View style={[styles.rule, { backgroundColor: palette.divider }]} />
          </View>

          <AuthSocialButtonRow
            labels={socialLabels}
            onPress={onProvider}
            borderColor={palette.socialBorder}
            textColor={palette.textPrimary}
            pressedBackground={palette.socialPressed}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Already have an account? Sign in"
            onPress={() => navigation.navigate('Login')}
            style={({ pressed }) => [
              styles.signIn,
              {
                borderColor: palette.socialBorder,
                backgroundColor: pressed
                  ? palette.socialPressed
                  : 'transparent',
              },
            ]}
          >
            <Text style={[styles.signInText, { color: palette.textPrimary }]}>
              Already have an account? Sign in
            </Text>
          </Pressable>

          <Text style={[styles.terms, { color: palette.textMuted }]}>
            By continuing you agree to Nearsy's{' '}
            <Text style={{ color: palette.chipText }}>Terms</Text> and{' '}
            <Text style={{ color: palette.chipText }}>Privacy Policy</Text>.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  card: {
    flexGrow: 1,
    marginTop: -22,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: 22,
    paddingTop: 22,
    justifyContent: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 11,
  },
  rule: { flex: 1, height: 1 },
  dividerText: { fontSize: 10.5 },
  signIn: {
    marginTop: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
  },
  signInText: { fontSize: 13.5, fontWeight: fontWeight.bold, textAlign: 'center' },
  terms: {
    fontSize: 10.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
  },
});
