// src/screens/LoginScreen.tsx ✅ RNFirebase-only — Dark Login redesign (TS-005)
import React, { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { firebaseAuth } from '../config/firebaseConfig'; // ✅ RNFirebase auth instance
import { loginWithEmail, sendPasswordReset } from '../services/authService';
import {
  isProfileComplete,
  getUserProfile,
} from '../services/firestoreService';
import {
  authenticateWithGoogle,
  GoogleAuthenticationError,
} from '../authentication/authenticateWithGoogle';
import { clearPendingGoogleProfilePrefill } from '../authentication/googleProfilePrefillStore';
import AnimatedNearsyLogo from '../components/auth/AnimatedNearsyLogo';
import {
  authColors,
  authGradients,
  authRadius,
  authTypography,
} from '../theme/authTokens';

type SocialProvider = 'google' | 'apple' | 'meta' | 'linkedin';

const SOCIAL_PROVIDERS: {
  id: SocialProvider;
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
}[] = [
  {
    id: 'google',
    icon: 'logo-google',
    labelKey: 'authentication.login.social.google',
  },
  {
    id: 'apple',
    icon: 'logo-apple',
    labelKey: 'authentication.login.social.apple',
  },
  {
    id: 'meta',
    icon: 'logo-facebook',
    labelKey: 'authentication.login.social.meta',
  },
  {
    id: 'linkedin',
    icon: 'logo-linkedin',
    labelKey: 'authentication.login.social.linkedin',
  },
];

export default function LoginScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // 🔔 Modal informativo para reset password
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoModalTitle, setInfoModalTitle] = useState('');
  const [infoModalMessage, setInfoModalMessage] = useState('');

  const busy = submitting || googleSubmitting;
  const heroHeight = Math.max(260, Math.min(372, windowHeight * 0.42));

  const showInfoModal = (title: string, message: string) => {
    setInfoModalTitle(title);
    setInfoModalMessage(message);
    setInfoModalVisible(true);
  };

  // Validador simple de email
  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  // Mensajes amigables por error de Firebase
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

  const routeAfterAuthenticatedLogin = async (
    uid: string,
    emailForProfile: string,
  ) => {
    const profile: any = await getUserProfile(uid);

    if (!profile) {
      Keyboard.dismiss();
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'CompleteProfile',
              params: {
                uid,
                email: emailForProfile,
              },
            },
          ],
        });
      }, 150);
      return;
    }

    const complete = await isProfileComplete(uid);

    Keyboard.dismiss();

    setTimeout(() => {
      if (complete) {
        // Drop any pending Google prefill so it cannot leak onto a later incomplete session.
        clearPendingGoogleProfilePrefill();
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      } else {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: 'CompleteProfile',
              params: {
                uid,
                email: emailForProfile,
                inputNonce: Date.now(),
              },
            },
          ],
        });
      }
    }, 150);
  };

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

      // 🔐 Política mínima: 8 caracteres
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
          await firebaseAuth.signOut(); // ✅ RNFirebase
        } catch {}
        Alert.alert(
          t('authentication.login.alerts.emailNotVerifiedTitle'),
          t('authentication.login.alerts.emailNotVerifiedMessage'),
        );
        return;
      }

      await routeAfterAuthenticatedLogin(
        user.uid,
        user.email ?? trimmedEmail,
      );
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

      // Mensaje genérico para no revelar si existe o no
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

  const handleGoogleSignIn = async () => {
    if (busy) return;

    if (Platform.OS !== 'android') {
      Alert.alert(
        t('authentication.social.comingSoonTitle'),
        t('authentication.social.comingSoonMessage'),
      );
      return;
    }

    setGoogleSubmitting(true);
    try {
      const result = await authenticateWithGoogle();
      await routeAfterAuthenticatedLogin(
        result.uid,
        result.email ?? '',
      );
    } catch (err) {
      if (err instanceof GoogleAuthenticationError) {
        if (__DEV__) {
          console.log('[LoginScreen] Google sign-in', {
            code: err.code,
            diagnosticCode: err.diagnosticCode,
          });
        }

        if (
          err.code === 'CANCELLED' ||
          err.code === 'OPERATION_IN_PROGRESS'
        ) {
          return;
        }

        Alert.alert(
          t('authentication.login.alerts.loginErrorTitle'),
          t(err.messageKey as any),
        );
        return;
      }

      Alert.alert(
        t('authentication.login.alerts.loginErrorTitle'),
        t('authentication.social.google.errors.generic'),
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSocialPress = (provider: SocialProvider) => {
    if (busy) return;

    if (provider === 'google') {
      void handleGoogleSignIn();
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
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <LinearGradient
            colors={[...authGradients.hero]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.8 }}
            style={[
              styles.hero,
              { height: heroHeight, paddingTop: insets.top + 24 },
            ]}
          >
            <Star top="18%" left="22%" size={3} opacity={0.5} />
            <Star top="26%" left="76%" size={2} opacity={0.7} />
            <Star top="60%" left="14%" size={2} opacity={0.5} />
            <Star top="66%" left="84%" size={3} opacity={0.6} />

            <AnimatedNearsyLogo size={46} />
            <Text style={styles.brand}>{t('common.appName')}</Text>
            <Text style={styles.tagline}>
              {t('authentication.login.tagline')}
            </Text>

            <Image
              source={require('../assets/people-illustration.png')}
              style={styles.illustration}
              resizeMode="contain"
            />
          </LinearGradient>

          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}
          >
            <Text style={styles.welcome}>
              {t('authentication.login.welcomeBack')}
            </Text>

            <View style={styles.fields}>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={authColors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t('authentication.login.emailPlaceholder')}
                  placeholderTextColor={authColors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  editable={!submitting}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={authColors.textMuted}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t('authentication.login.passwordPlaceholder')}
                  placeholderTextColor={authColors.textMuted}
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
                    color={authColors.textMuted}
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
              <Text style={styles.forgot}>
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
                  style={[styles.primaryButton, styles.primaryButtonDisabled]}
                >
                  <ActivityIndicator color={authColors.white} />
                </View>
              ) : (
                <LinearGradient
                  colors={[...authGradients.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    {t('authentication.login.submit')}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>

            <Divider label={t('authentication.login.newHere')} strong />

            <Pressable
              onPress={handleCreateProfile}
              disabled={busy}
              style={({ pressed }) => [
                styles.outlineButton,
                {
                  backgroundColor: pressed ? authColors.panel : 'transparent',
                  transform: [{ scale: pressed && !busy ? 0.98 : 1 }],
                },
              ]}
            >
              <Text style={styles.outlineButtonText}>
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
              <Text style={styles.guideLink}>
                {t('authentication.login.viewRegistrationGuide')}
              </Text>
            </TouchableOpacity>

            <Divider label={t('authentication.login.orContinueWith')} />

            <View style={styles.socialRow}>
              {SOCIAL_PROVIDERS.map((provider) => {
                const isGoogleLoading =
                  provider.id === 'google' && googleSubmitting;

                return (
                  <Pressable
                    key={provider.id}
                    style={({ pressed }) => [
                      styles.socialButton,
                      {
                        backgroundColor: pressed
                          ? authColors.panel
                          : 'transparent',
                        opacity: busy && !isGoogleLoading ? 0.6 : 1,
                      },
                    ]}
                    onPress={() => handleSocialPress(provider.id)}
                    disabled={busy}
                  >
                    {isGoogleLoading ? (
                      <ActivityIndicator
                        size="small"
                        color={authColors.textPrimary}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name={provider.icon}
                          size={14}
                          color={authColors.textPrimary}
                          style={styles.socialIcon}
                        />
                        <Text style={styles.socialText} numberOfLines={1}>
                          {t(provider.labelKey)}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.terms}>
              {t('authentication.login.termsPrefix')}{' '}
              <Text style={styles.termsLink}>
                {t('authentication.login.termsLink')}
              </Text>{' '}
              {t('authentication.login.termsAnd')}{' '}
              <Text style={styles.termsLink}>
                {t('authentication.login.privacyLink')}
              </Text>
              .
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🔔 Modal informativo para reset password */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{infoModalTitle}</Text>
            <Text style={styles.modalMessage}>{infoModalMessage}</Text>

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setInfoModalVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalButtonText}>
                {t('common.buttons.ok')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Star({
  top,
  left,
  size,
  opacity,
}: {
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  opacity: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: authColors.white,
        opacity,
      }}
    />
  );
}

function Divider({ label, strong }: { label: string; strong?: boolean }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.rule} />
      <Text style={[styles.dividerLabel, strong && styles.dividerLabelStrong]}>
        {label}
      </Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authColors.bg,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: authColors.bg,
  },
  hero: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  brand: {
    ...authTypography.brand,
    color: authColors.white,
    marginTop: 6,
  },
  tagline: {
    ...authTypography.tagline,
    color: authColors.tagline,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  illustration: {
    position: 'absolute',
    bottom: 8,
    width: 158,
    height: 150,
    opacity: 0.96,
  },
  sheet: {
    flexGrow: 1,
    backgroundColor: authColors.bg,
    borderTopLeftRadius: authRadius.sheet,
    borderTopRightRadius: authRadius.sheet,
    marginTop: -22,
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  welcome: {
    ...authTypography.welcome,
    color: authColors.textPrimary,
  },
  fields: {
    gap: 9,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: authColors.inputBg,
    borderWidth: 1,
    borderColor: authColors.inputBorder,
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
    color: authColors.textPrimary,
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
    color: authColors.accent,
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
  primaryButtonDisabled: {
    backgroundColor: authColors.disabledBg,
  },
  primaryButtonText: {
    ...authTypography.button,
    color: authColors.white,
  },
  outlineButton: {
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: authColors.inputBorder,
    borderRadius: authRadius.md,
  },
  outlineButtonText: {
    ...authTypography.button,
    color: authColors.textPrimary,
  },
  guideLinkWrap: {
    alignSelf: 'center',
    marginTop: 10,
  },
  guideLink: {
    fontSize: 12,
    color: authColors.accent,
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
    backgroundColor: authColors.border,
  },
  dividerLabel: {
    ...authTypography.divider,
    color: authColors.textMuted,
  },
  dividerLabelStrong: {
    ...authTypography.dividerStrong,
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  socialButton: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: authColors.inputBorder,
    borderRadius: authRadius.social,
    flexDirection: 'row',
  },
  socialIcon: {
    marginRight: 4,
  },
  socialText: {
    ...authTypography.social,
    color: authColors.textPrimary,
  },
  terms: {
    ...authTypography.terms,
    color: authColors.textMuted,
    textAlign: 'center',
    marginTop: 14,
  },
  termsLink: {
    color: authColors.accent,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: authColors.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: authColors.modalCard,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: authColors.border,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  modalTitle: {
    ...authTypography.modalTitle,
    color: authColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    ...authTypography.modalMessage,
    color: authColors.textSecondary,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalButton: {
    marginTop: 4,
    backgroundColor: authColors.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: authRadius.pill,
  },
  modalButtonText: {
    color: authColors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
