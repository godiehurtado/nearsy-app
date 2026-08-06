import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
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
import { useGoogleSignInFlow } from '../hooks/useGoogleSignInFlow';
import { markWelcomeSeen } from '../onboarding/welcomeStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

/**
 * Welcome — first-launch only entry to Register / Login / Google.
 * Marked seen on a valid exit CTA (not on mount).
 */
export default function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { theme, palette } = useAppTheme();
  const { t } = useTranslation();
  const { signInWithGoogle, googleSubmitting } = useGoogleSignInFlow();
  // Match Login surface so shared brand hero (logo / waves / people) reads the same.
  const screenBg = theme === 'dark' ? palette.background : palette.heroBg;

  async function leaveWelcome(
    action: () => void,
  ): Promise<void> {
    await markWelcomeSeen();
    action();
  }

  function onProvider(p: AuthSocialProvider) {
    if (p === 'google') {
      void leaveWelcome(() => {
        void signInWithGoogle();
      });
      return;
    }
    Alert.alert(
      t('authentication.social.comingSoonTitle'),
      t('authentication.social.comingSoonMessage'),
    );
  }

  const socialLabels = {
    google: t('authentication.login.social.google'),
    apple: t('authentication.login.social.apple'),
    meta: t('authentication.login.social.meta'),
    linkedin: t('authentication.login.social.linkedin'),
  };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 16 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <WelcomeHero />

        {/* Actions sit on screenBg — no white/navy sheet (matches Login). */}
        <View style={styles.actions}>
          <PrimaryButton
            label={t('authentication.register.title')}
            onPress={() => {
              void leaveWelcome(() => navigation.navigate('Register'));
            }}
          />

          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: palette.divider }]} />
            <Text style={[styles.dividerText, { color: palette.dividerText }]}>
              {t('authentication.login.orContinueWith')}
            </Text>
            <View style={[styles.rule, { backgroundColor: palette.divider }]} />
          </View>

          <AuthSocialButtonRow
            labels={socialLabels}
            onPress={onProvider}
            busy={googleSubmitting}
            loadingProvider={googleSubmitting ? 'google' : null}
            borderColor={palette.socialBorder}
            textColor={palette.textPrimary}
            pressedBackground={palette.socialPressed}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('authentication.register.loginLink')}
            onPress={() => {
              void leaveWelcome(() => navigation.navigate('Login'));
            }}
            disabled={googleSubmitting}
            style={({ pressed }) => [
              styles.signIn,
              {
                borderColor: palette.socialBorder,
                backgroundColor: pressed
                  ? palette.socialPressed
                  : 'transparent',
                opacity: googleSubmitting ? 0.55 : 1,
              },
            ]}
          >
            <Text style={[styles.signInText, { color: palette.textPrimary }]}>
              {t('authentication.register.loginLink')}
            </Text>
          </Pressable>

          <Text style={[styles.terms, { color: palette.textMuted }]}>
            {t('authentication.login.termsPrefix')}{' '}
            <Text style={{ color: palette.chipText }}>
              {t('authentication.login.termsLink')}
            </Text>{' '}
            {t('authentication.login.termsAnd')}{' '}
            <Text style={{ color: palette.chipText }}>
              {t('authentication.login.privacyLink')}
            </Text>
            .
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
  actions: {
    paddingHorizontal: 22,
    paddingTop: 16,
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
  signInText: {
    fontSize: 13.5,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  terms: {
    fontSize: 10.5,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
  },
});
