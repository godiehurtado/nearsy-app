// src/screens/PhoneVerificationScreen.ios.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RegistrationLayout } from '../components/registration/RegistrationLayout';
import { RegistrationProgress } from '../components/registration/RegistrationProgress';
import { RegistrationFadeSlideIn } from '../components/registration/RegistrationFadeSlideIn';
import { FormInput } from '../components/registration/FormInput';
import { REGISTRATION_COUNTRIES } from '../components/registration/countries';
import { authPhaseProgress } from '../components/registration/crjProgress';
import { PrimaryButton, SecondaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';
import { firebaseAuth } from '../config/firebaseConfig';
import { buildFullPhoneNumber, sanitizePhoneNumber } from '../settings/settingsPhoneCountries';
import { isValidE164Phone, normalizeCanonicalPhone } from '../settings/settingsContracts';
import { getPhoneOtpClient } from '../phoneOtp/iosPhoneOtpFoundation';
import { clearPendingSocialProfilePrefill } from '../authentication/social';
import {
  createPhoneOtpSignOutPressHandler,
  resetAuthNavigationToLogin,
  runPhoneOtpScreenSignOut,
} from '../phoneOtp/phoneOtpSignOut';
import {
  createPhoneOtpController,
  type PhoneOtpController,
  type PhoneOtpViewState,
} from '../phoneOtp/phoneOtpController';

type ScreenPhase = 'capture' | 'confirm' | 'code' | 'success' | 'terminal';

function isValidPhone(fullPhone: string) {
  return isValidE164Phone(normalizeCanonicalPhone(fullPhone));
}

type OtpContextualActionProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  palette: ReturnType<typeof useAppTheme>['palette'];
};

/** Secondary contextual action (resend countdown, try again). */
function OtpContextualAction({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
  palette,
}: OtpContextualActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.actionControl,
        {
          borderColor: disabled ? palette.border : palette.socialBorder,
          backgroundColor: pressed && !disabled ? palette.socialPressed : 'transparent',
          opacity: disabled ? 0.72 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.actionControlLabel,
          { color: disabled ? palette.textMuted : palette.primary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type OtpSignOutFooterProps = {
  signingOut: boolean;
  signOutError: string | null;
  onSignOut: () => void;
  palette: ReturnType<typeof useAppTheme>['palette'];
  signingOutLabel: string;
  signOutLabel: string;
  signOutA11y: string;
};

function OtpSignOutFooter({
  signingOut,
  signOutError,
  onSignOut,
  palette,
  signingOutLabel,
  signOutLabel,
  signOutA11y,
}: OtpSignOutFooterProps) {
  return (
    <View
      style={[
        styles.signOutSection,
        { borderTopColor: palette.border },
      ]}
    >
      {signOutError ? (
        <Text
          style={[styles.error, { color: palette.danger }]}
          accessibilityRole="alert"
        >
          {signOutError}
        </Text>
      ) : null}
      <Pressable
        onPress={onSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityLabel={signOutA11y}
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
        style={({ pressed }) => [
          styles.signOutControl,
          {
            borderColor: palette.danger,
            backgroundColor: pressed && !signingOut ? `${palette.danger}14` : 'transparent',
            opacity: signingOut ? 0.72 : 1,
          },
        ]}
      >
        <Text style={[styles.signOutText, { color: palette.danger }]}>
          {signingOut ? signingOutLabel : signOutLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function PhoneVerificationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t, i18n } = useTranslation();

  const controllerRef = useRef<PhoneOtpController | null>(null);
  const aliveRef = useRef(true);
  const signingOutRef = useRef(false);
  const [view, setView] = useState<PhoneOtpViewState | null>(null);
  const [countryDial, setCountryDial] = useState(REGISTRATION_COUNTRIES[0].dial);
  const [localPhone, setLocalPhone] = useState('');
  const [showCountries, setShowCountries] = useState(false);
  const [tick, setTick] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const locale = i18n.language === 'es' ? 'es' : 'en';

  const syncView = useCallback((next: PhoneOtpViewState) => {
    if (!aliveRef.current) return next;
    setView(next);
    return next;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    signingOutRef.current = signingOut;
  }, [signingOut]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const client = await getPhoneOtpClient();
        if (!alive) return;
        const controller = createPhoneOtpController({ client, locale });
        controllerRef.current = controller;
        const boot = await controller.bootstrap();
        if (!alive) return;
        syncView(boot);
        if (boot.phase === 'verified') {
          navigation.replace('ProfileCompletion', {
            uid: firebaseAuth.currentUser?.uid,
            email: firebaseAuth.currentUser?.email,
            inputNonce: Date.now(),
          });
        }
      } catch {
        if (!alive) return;
        syncView({
          phase: 'failed',
          challengeId: null,
          maskedPhone: null,
          expiresAt: null,
          resendAvailableAt: null,
          attemptsRemaining: null,
          sendsRemaining30m: null,
          sendsRemaining24h: null,
          phoneE164InMemory: null,
          code: '',
          lastError: null,
          operationInFlight: false,
          bootstrapComplete: true,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [locale, navigation, syncView]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !controllerRef.current) return;
      void controllerRef.current.onForeground().then(syncView);
    });
    return () => sub.remove();
  }, [syncView]);

  useEffect(() => {
    if (!view?.resendAvailableAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [view?.resendAvailableAt]);

  const fullPhone = useMemo(() => {
    const local = sanitizePhoneNumber(localPhone);
    return local ? buildFullPhoneNumber(countryDial, local) : '';
  }, [countryDial, localPhone]);

  const screenPhase: ScreenPhase = useMemo(() => {
    if (!view) return 'capture';
    if (view.phase === 'verified') return 'success';
    if (
      view.phase === 'feature_disabled' ||
      view.phase === 'expired' ||
      view.phase === 'locked' ||
      view.phase === 'cancelled' ||
      view.phase === 'app_check_failure' ||
      view.phase === 'auth_failure'
    ) {
      return 'terminal';
    }
    if (view.phase === 'confirm') return 'confirm';
    if (
      view.phase === 'pending' ||
      view.phase === 'checking' ||
      view.phase === 'sending'
    ) {
      return 'code';
    }
    return 'capture';
  }, [view]);

  const errorMessage = useMemo(() => {
    if (!view?.lastError) return null;
    const key = view.lastError.messageKey;
    return t(key as any);
  }, [view?.lastError, t]);

  const resendSeconds = useMemo(() => {
    void tick;
    return controllerRef.current?.resendSecondsRemaining() ?? 0;
  }, [tick, view?.resendAvailableAt]);

  const canResend = controllerRef.current?.canResend() ?? false;

  const handleSignOutPress = useMemo(
    () =>
      createPhoneOtpSignOutPressHandler({
        isSigningOut: () => signingOutRef.current,
        setSigningOut,
        setSignOutError,
        translate: (key) => t(key),
        isMounted: () => aliveRef.current,
        runSignOut: () =>
          runPhoneOtpScreenSignOut({
            controller: controllerRef.current,
            signOut: () => firebaseAuth.signOut(),
            clearSocialPrefill: () => clearPendingSocialProfilePrefill(),
            clearSensitiveLocalState: () => {
              setLocalPhone('');
              setShowCountries(false);
              controllerRef.current = null;
            },
            resetNavigationToLogin: () =>
              resetAuthNavigationToLogin(navigation),
          }),
      }),
    [navigation, t],
  );

  async function onContinueCapture() {
    const controller = controllerRef.current;
    if (!controller || !isValidPhone(fullPhone)) return;
    syncView(controller.setPhoneE164(normalizeCanonicalPhone(fullPhone)));
  }

  async function onSendCode() {
    const controller = controllerRef.current;
    if (!controller || !fullPhone) return;
    syncView(await controller.startVerification(normalizeCanonicalPhone(fullPhone)));
  }

  async function onVerify() {
    const controller = controllerRef.current;
    if (!controller) return;
    const next = await controller.checkCode();
    syncView(next);
    if (next.phase === 'verified') {
      navigation.replace('ProfileCompletion', {
        uid: firebaseAuth.currentUser?.uid,
        email: firebaseAuth.currentUser?.email,
        inputNonce: Date.now(),
      });
    }
  }

  async function onResend() {
    const controller = controllerRef.current;
    if (!controller) return;
    syncView(await controller.resend());
  }

  async function onChangeNumber() {
    const controller = controllerRef.current;
    if (!controller) return;
    setLocalPhone('');
    syncView(await controller.changePhone());
  }

  async function onRetryBootstrap() {
    const controller = controllerRef.current;
    if (!controller || signingOut || view?.operationInFlight) return;
    syncView(await controller.bootstrap());
  }

  const busy = (view?.operationInFlight ?? false) || signingOut;

  const signOutFooter = (
    <OtpSignOutFooter
      signingOut={signingOut}
      signOutError={signOutError}
      onSignOut={() => {
        void handleSignOutPress();
      }}
      palette={palette}
      signingOutLabel={t('phoneOtp.signOut.signingOut')}
      signOutLabel={t('phoneOtp.signOut.label')}
      signOutA11y={t('phoneOtp.a11y.signOutButton')}
    />
  );

  const afterPrimaryActions = (content: React.ReactNode) => (
    <View style={styles.actionSection}>{content}</View>
  );

  return (
    <RegistrationLayout>
      <View style={styles.header}>
        <RegistrationProgress progress={authPhaseProgress(3, 4)} />
      </View>

      <ScrollView
        style={styles.stepScroll}
        contentContainerStyle={[
          styles.stepBody,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!view ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={[styles.hint, { color: palette.textSecondary }]}>
              {t('phoneOtp.states.loading')}
            </Text>
            {afterPrimaryActions(signOutFooter)}
          </View>
        ) : (
          <RegistrationFadeSlideIn animKey={screenPhase}>
            {screenPhase === 'capture' && (
              <>
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  {t('phoneOtp.phoneStep.title')}
                </Text>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {t('phoneOtp.phoneStep.subtitle')}
                </Text>
                <View style={styles.phoneRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('phoneOtp.a11y.countrySelector')}
                    onPress={() => setShowCountries((v) => !v)}
                    style={[
                      styles.dialBtn,
                      {
                        borderColor: palette.borderStrong,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: palette.textPrimary, fontWeight: fontWeight.bold }}>
                      {countryDial}
                    </Text>
                  </Pressable>
                  <View style={styles.phoneField}>
                    <FormInput
                      placeholder={t('phoneOtp.phoneStep.phonePlaceholder')}
                      keyboardType="phone-pad"
                      value={localPhone}
                      onChangeText={(v) => setLocalPhone(v.replace(/[^\d]/g, ''))}
                    />
                  </View>
                </View>
                {showCountries ? (
                  <View
                    style={[
                      styles.countryList,
                      { borderColor: palette.border, backgroundColor: palette.panel },
                    ]}
                  >
                    {REGISTRATION_COUNTRIES.map((c) => (
                      <Pressable
                        key={`${c.iso2}-${c.dial}`}
                        onPress={() => {
                          setCountryDial(c.dial);
                          setShowCountries(false);
                        }}
                        style={styles.countryRow}
                      >
                        <Text style={{ color: palette.textPrimary }}>{c.flag} {c.name}</Text>
                        <Text style={{ color: palette.textSecondary }}>{c.dial}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {errorMessage ? (
                  <Text style={[styles.error, { color: palette.danger }]}>{errorMessage}</Text>
                ) : null}
                <PrimaryButton
                  label={t('phoneOtp.phoneStep.continue')}
                  onPress={onContinueCapture}
                  disabled={!isValidPhone(fullPhone) || busy}
                  loading={busy}
                />
                {afterPrimaryActions(signOutFooter)}
              </>
            )}

            {screenPhase === 'confirm' && (
              <>
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  {t('phoneOtp.confirmStep.title')}
                </Text>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {t('phoneOtp.confirmStep.subtitle')}
                </Text>
                <Text style={[styles.phoneConfirm, { color: palette.textPrimary }]}>
                  {fullPhone}
                </Text>
                {errorMessage ? (
                  <Text style={[styles.error, { color: palette.danger }]}>{errorMessage}</Text>
                ) : null}
                <PrimaryButton
                  label={t('phoneOtp.confirmStep.sendCode')}
                  onPress={onSendCode}
                  disabled={busy}
                  loading={busy}
                />
                {afterPrimaryActions(
                  <>
                    <SecondaryButton
                      label={t('phoneOtp.confirmStep.changeNumber')}
                      onPress={onChangeNumber}
                      disabled={busy}
                    />
                    {signOutFooter}
                  </>,
                )}
              </>
            )}

            {screenPhase === 'code' && (
              <>
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  {t('phoneOtp.codeStep.title')}
                </Text>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {t('phoneOtp.codeStep.subtitle', {
                    maskedPhone: view.maskedPhone ?? '••••',
                  })}
                </Text>
                <FormInput
                  label={t('phoneOtp.codeStep.codeLabel')}
                  placeholder={t('phoneOtp.codeStep.codePlaceholder')}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  value={view.code}
                  onChangeText={(v) => {
                    const controller = controllerRef.current;
                    if (!controller) return;
                    syncView(controller.setCode(v));
                  }}
                  maxLength={6}
                  accessibilityLabel={t('phoneOtp.a11y.codeInput')}
                />
                {view.attemptsRemaining != null ? (
                  <Text style={[styles.hint, { color: palette.textSecondary }]}>
                    {t('phoneOtp.codeStep.attemptsRemaining', {
                      count: view.attemptsRemaining,
                    })}
                  </Text>
                ) : null}
                {errorMessage ? (
                  <Text style={[styles.error, { color: palette.danger }]}>{errorMessage}</Text>
                ) : null}
                <PrimaryButton
                  label={t('phoneOtp.codeStep.verify')}
                  onPress={onVerify}
                  disabled={busy || view.code.length !== 6}
                  loading={busy || view.phase === 'checking'}
                />
                {afterPrimaryActions(
                  <>
                    <View style={styles.actionStack}>
                      <OtpContextualAction
                        label={
                          canResend
                            ? t('phoneOtp.codeStep.resend')
                            : t('phoneOtp.codeStep.resendIn', { seconds: resendSeconds })
                        }
                        onPress={onResend}
                        disabled={!canResend || busy}
                        accessibilityLabel={t('phoneOtp.a11y.resendButton')}
                        palette={palette}
                      />
                      <SecondaryButton
                        label={t('phoneOtp.codeStep.changeNumber')}
                        onPress={onChangeNumber}
                        disabled={busy}
                      />
                    </View>
                    {signOutFooter}
                  </>,
                )}
              </>
            )}

            {screenPhase === 'terminal' && (
              <>
                <Ionicons
                  name="alert-circle-outline"
                  size={40}
                  color={palette.primary}
                  style={styles.icon}
                />
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  {view.phase === 'feature_disabled'
                    ? t('phoneOtp.states.featureDisabledTitle')
                    : view.phase === 'expired'
                      ? t('phoneOtp.states.expiredTitle')
                      : view.phase === 'locked'
                        ? t('phoneOtp.states.lockedTitle')
                        : view.phase === 'cancelled'
                          ? t('phoneOtp.states.cancelledTitle')
                          : t('phoneOtp.states.failedTitle')}
                </Text>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {errorMessage ??
                    (view.phase === 'feature_disabled'
                      ? t('phoneOtp.states.featureDisabledMessage')
                      : t('phoneOtp.states.failedMessage'))}
                </Text>
                <PrimaryButton
                  label={t('phoneOtp.confirmStep.changeNumber')}
                  onPress={onChangeNumber}
                />
                {afterPrimaryActions(
                  <>
                    <OtpContextualAction
                      label={t('phoneOtp.states.retryBootstrap')}
                      onPress={() => {
                        void onRetryBootstrap();
                      }}
                      disabled={busy}
                      palette={palette}
                    />
                    {signOutFooter}
                  </>,
                )}
              </>
            )}

            {screenPhase === 'success' && (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={48}
                  color={palette.primary}
                  style={styles.icon}
                />
                <Text style={[styles.title, { color: palette.textPrimary }]}>
                  {t('phoneOtp.success.title')}
                </Text>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {t('phoneOtp.success.subtitle')}
                </Text>
                {afterPrimaryActions(signOutFooter)}
              </>
            )}
          </RegistrationFadeSlideIn>
        )}
      </ScrollView>
    </RegistrationLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
  stepScroll: {
    flex: 1,
  },
  stepBody: {
    paddingBottom: spacing.xl,
  },
  loadingBlock: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    lineHeight: fontSize.xl * 1.2,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dialBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    minHeight: 52,
  },
  phoneField: { flex: 1 },
  countryList: {
    borderWidth: 1,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    maxHeight: 220,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  phoneConfirm: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  hint: { fontSize: fontSize.sm, marginBottom: spacing.sm },
  error: { fontSize: fontSize.sm, marginBottom: spacing.md },
  actionSection: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  actionStack: {
    gap: spacing.md,
  },
  actionControl: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionControlLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.15,
    textAlign: 'center',
  },
  signOutSection: {
    marginTop: spacing.xl,
    gap: spacing.md,
    paddingTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signOutControl: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  icon: { alignSelf: 'center', marginBottom: spacing.md },
});
