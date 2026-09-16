// src/screens/LoginScreen.tsx — RNFirebase-only, themed Login (CRJ)
import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Keyboard,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { firebaseAuth } from '../config/firebaseConfig';
import { loginWithEmail, sendPasswordReset } from '../services/authService';
import {
  isProfileComplete,
  getUserProfile,
} from '../services/firestoreService';
import { clearPendingSocialProfilePrefill } from '../authentication/social';
import { useTranslation } from '../i18n';
import { authGradients, authRadius, authTypography } from '../theme/authTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { LoginHero } from '../components/LoginHero';
import {
  AuthSocialButtonRow,
  AuthSocialProvider,
} from '../components/AuthSocialButtonRow';
import { useGoogleSignInFlow } from '../hooks/useGoogleSignInFlow';
import { useLinkedInSignInFlow } from '../hooks/useLinkedInSignInFlow';
import { isNearsyLinkedInAuthAllowed } from '../config/nearsyFirebaseEnv';

export default function LoginScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { theme, palette } = useAppTheme();
  const { signInWithGoogle, googleSubmitting } = useGoogleSignInFlow();
  const { signInWithLinkedIn, linkedInSubmitting } = useLinkedInSignInFlow();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');

  const busy = submitting || googleSubmitting || linkedInSubmitting;
  const isDark = theme === 'dark';
  // Login approved surface: uniform pastel (clear) / navy (dark) — not white card.
  const screenBg = isDark ? palette.background : palette.heroBg;
  // Dark keeps the approved Login CTA (navy→teal); Light uses theme primary.
  const ctaGradient = isDark
    ? authGradients.primary
    : palette.primaryGradient;
  const onPrimary = '#FFFFFF';

  const showInfoModal = (title: string, message: string) => {
    setInfoModalTitle(title);
    setInfoModalMessage(message);
    setInfoModalVisible(true);
  };

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  function getAuthErrorMessage(code?: string) {
    switch (code) {
      case 'auth/invalid-email':
      case 'auth/missing-email':
        return t('authentication.errors.invalidEmail');

      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return t('authentication.errors.invalidCredential');

      case 'auth/weak-password':
        return t('authentication.errors.weakPassword');

      case 'auth/email-already-in-use':
        return t('authentication.errors.emailAlreadyInUse');

      case 'auth/network-request-failed':
        return t('authentication.errors.networkRequestFailed');

      case 'auth/too-many-requests':
        return t('authentication.errors.tooManyRequests');

      case 'auth/operation-not-allowed':
        return t('authentication.errors.operationNotAllowedSignIn');

      default:
        return t('authentication.errors.generic');
    }
  }

  const handleLogin = async () => {
    if (busy) return;

    try {
      const trimmedEmail = email.trim();

      if (!isValidEmail(trimmedEmail)) {
        Alert.alert(
          t('authentication.login.alerts.invalidEmailTitle'),
          t('authentication.login.alerts.invalidEmailMessage'),
        );
        return;
      }

      if (!password) {
        Alert.alert(
          t('authentication.login.alerts.missingPasswordTitle'),
          t('authentication.login.alerts.missingPasswordMessage'),
        );
        return;
      }

      // Minimum policy: 8 characters.
      if (password.length < 8) {
        Alert.alert(
          t('authentication.login.alerts.weakPasswordTitle'),
          t('authentication.login.alerts.weakPasswordMessage'),
        );
        return;
      }

      setSubmitting(true);
      const { user } = await loginWithEmail(trimmedEmail, password);

      // TEMP: Email verification temporarily disabled (Android only).
      if (Platform.OS !== 'android' && !user.emailVerified) {
        try {
          await firebaseAuth.signOut(); // RNFirebase
        } catch {}
        Alert.alert(
          t('authentication.login.alerts.emailNotVerifiedTitle'),
          t('authentication.login.alerts.emailNotVerifiedMessage'),
        );
        return;
      }

      const profile: any = await getUserProfile(user.uid);

      if (!profile) {
        Keyboard.dismiss();
        setTimeout(() => {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'ProfileCompletion',
                params: {
                  uid: user.uid,
                  email: user.email ?? trimmedEmail,
                },
              },
            ],
          });
        }, 150);
        return;
      }

      const complete = await isProfileComplete(user.uid);

      Keyboard.dismiss();

      setTimeout(() => {
        if (complete) {
          // Drop any pending Google prefill so it cannot leak onto a later incomplete session.
          clearPendingSocialProfilePrefill();
          navigation.reset({
            index: 0,
            routes: [{ name: 'MainTabs' }],
          });
        } else {
          navigation.reset({
            index: 0,
            routes: [
              {
                name: 'ProfileCompletion',
                params: {
                  uid: user.uid,
                  email: user.email ?? trimmedEmail,
                  inputNonce: Date.now(),
                },
              },
            ],
          });
        }
      }, 150);
    } catch (e: any) {
      const msg = getAuthErrorMessage(e?.code);
      if (__DEV__) {
        console.log('LOGIN ERROR =>', e?.code, e?.message);
      }
      Alert.alert(t('authentication.login.alerts.loginErrorTitle'), msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();

    if (!trimmed) {
      showInfoModal(
        t('authentication.forgotPassword.emptyEmailTitle'),
        t('authentication.forgotPassword.emptyEmailMessage'),
      );
      return;
    }

    if (!isValidEmail(trimmed)) {
      showInfoModal(
        t('authentication.forgotPassword.invalidEmailTitle'),
        t('authentication.forgotPassword.invalidEmailMessage'),
      );
      return;
    }

    try {
      await sendPasswordReset(trimmed);

      // Generic message to avoid revealing whether the account exists.
      showInfoModal(
        t('authentication.forgotPassword.successTitle'),
        t('authentication.forgotPassword.successMessage'),
      );
    } catch (e: any) {
      if (e?.code === 'auth/network-request-failed') {
        showInfoModal(
          t('authentication.forgotPassword.networkErrorTitle'),
          t('authentication.forgotPassword.networkErrorMessage'),
        );
      } else {
        showInfoModal(
          t('authentication.forgotPassword.genericTitle'),
          t('authentication.forgotPassword.genericMessage'),
        );
      }
    }
  };

  const handleSocialPress = (provider: AuthSocialProvider) => {
    if (busy) return;

    if (provider === 'google') {
      void signInWithGoogle();
      return;
    }

    // A3: LinkedIn OAuth on Android when environment pair is valid (dev↔nearsy-dev or prod↔nearsy-pj).
    if (
      provider === 'linkedin' &&
      Platform.OS === 'android' &&
      isNearsyLinkedInAuthAllowed()
    ) {
      void signInWithLinkedIn();
      return;
    }

    Alert.alert(
      t('authentication.social.comingSoonTitle'),
      t('authentication.social.comingSoonMessage'),
    );
  };

  const handleCreateProfile = () => {
    navigation.navigate('Register');
  };

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            {
              backgroundColor: screenBg,
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16) + 24,
            },
          ]}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <LoginHero />

          <View style={styles.form}>
            <Text style={[styles.welcome, { color: palette.textPrimary }]}>
              {t('authentication.login.welcomeBack')}
            </Text>

            <View style={styles.fields}>
              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={palette.placeholder}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder={t('authentication.login.emailPlaceholder')}
                  placeholderTextColor={palette.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>

              <View
                style={[
                  styles.inputContainer,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={palette.placeholder}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: palette.textPrimary }]}
                  placeholder={t('authentication.login.passwordPlaceholder')}
                  placeholderTextColor={palette.placeholder}
                  secureTextEntry={!passwordVisible}
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
                <TouchableOpacity
                  onPress={() => setPasswordVisible((prev) => !prev)}
                  style={styles.eyeButton}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={palette.placeholder}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotWrap}
              onPress={handleForgotPassword}
              activeOpacity={0.7}
              disabled={busy}
            >
              <Text style={[styles.forgot, { color: palette.chipText }]}>
                {t('authentication.login.forgotPassword')}
              </Text>
            </TouchableOpacity>

            <Pressable
              onPress={handleLogin}
              disabled={busy}
              style={({ pressed }) => [
                styles.primaryButtonWrap,
                { transform: [{ scale: pressed && !busy ? 0.98 : 1 }] },
              ]}
            >
              {submitting ? (
                <View
                  style={[
                    styles.primaryButton,
                    styles.primaryButtonDisabled,
                    { backgroundColor: palette.borderStrong },
                  ]}
                >
                  <ActivityIndicator color={onPrimary} />
                </View>
              ) : (
                <LinearGradient
                  colors={[...ctaGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <Text style={[styles.primaryButtonText, { color: onPrimary }]}>
                    {t('authentication.login.submit')}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>

            <Divider
              label={t('authentication.login.newHere')}
              strong
              ruleColor={palette.divider}
              labelColor={palette.dividerText}
            />

            <Pressable
              onPress={handleCreateProfile}
              disabled={busy}
              style={({ pressed }) => [
                styles.outlineButton,
                {
                  borderColor: palette.socialBorder,
                  backgroundColor: pressed
                    ? palette.socialPressed
                    : 'transparent',
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
              ]}
            >
              <Text
                style={[styles.outlineButtonText, { color: palette.textPrimary }]}
              >
                {t('authentication.login.createProfile')}
              </Text>
            </Pressable>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('IntroVideo', { preview: false })
              }
              disabled={busy}
              style={styles.guideLinkWrap}
              activeOpacity={0.7}
            >
              <Text style={[styles.guideLink, { color: palette.chipText }]}>
                {t('authentication.login.viewRegistrationGuide')}
              </Text>
            </TouchableOpacity>

            <Divider
              label={t('authentication.login.orContinueWith')}
              ruleColor={palette.divider}
              labelColor={palette.dividerText}
            />

            <AuthSocialButtonRow
              labels={{
                google: t('authentication.login.social.google'),
                apple: t('authentication.login.social.apple'),
                meta: t('authentication.login.social.meta'),
                linkedin: t('authentication.login.social.linkedin'),
              }}
              onPress={handleSocialPress}
              busy={busy}
              loadingProvider={
                googleSubmitting
                  ? 'google'
                  : linkedInSubmitting
                    ? 'linkedin'
                    : null
              }
              borderColor={palette.socialBorder}
              textColor={palette.textPrimary}
              pressedBackground={palette.socialPressed}
            />

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
      </KeyboardAvoidingView>

      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]}>
              {infoModalTitle}
            </Text>
            <Text
              style={[styles.modalMessage, { color: palette.textSecondary }]}
            >
              {infoModalMessage}
            </Text>

            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: palette.primary }]}
              onPress={() => setInfoModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.modalButtonText, { color: onPrimary }]}>
                {t('common.buttons.ok')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Divider({
  label,
  strong,
  ruleColor,
  labelColor,
}: {
  label: string;
  strong?: boolean;
  ruleColor: string;
  labelColor: string;
}) {
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.rule, { backgroundColor: ruleColor }]} />
      <Text
        style={[
          styles.dividerLabel,
          { color: labelColor },
          strong && styles.dividerLabelStrong,
        ]}
      >
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: ruleColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
  },
  form: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  welcome: {
    ...authTypography.welcome,
  },
  fields: {
    gap: 9,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: authRadius.md,
    paddingHorizontal: 14,
    width: '100%',
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: authTypography.body.fontSize,
    fontWeight: authTypography.body.fontWeight,
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: 7,
  },
  forgot: {
    ...authTypography.forgot,
  },
  primaryButtonWrap: {
    marginTop: 12,
    borderRadius: authRadius.md,
    overflow: 'hidden',
  },
  primaryButton: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: authRadius.md,
    minHeight: 48,
  },
  primaryButtonDisabled: {},
  primaryButtonText: {
    ...authTypography.button,
  },
  outlineButton: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: authRadius.md,
  },
  outlineButtonText: {
    ...authTypography.button,
  },
  guideLinkWrap: {
    alignSelf: 'center',
    marginTop: 10,
  },
  guideLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  rule: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    ...authTypography.divider,
  },
  dividerLabelStrong: {
    ...authTypography.dividerStrong,
  },
  terms: {
    ...authTypography.terms,
    textAlign: 'center',
    marginTop: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  modalTitle: {
    ...authTypography.modalTitle,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    ...authTypography.modalMessage,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalButton: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: authRadius.pill,
  },
  modalButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
