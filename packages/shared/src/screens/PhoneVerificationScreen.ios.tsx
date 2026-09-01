// src/screens/PhoneVerificationScreen.ios.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
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
import { PrimaryButton } from '../components/PrimaryButton';
import { useAppTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { useTranslation } from '../i18n';
import { firebaseAuth } from '../config/firebaseConfig';
import { buildFullPhoneNumber, sanitizePhoneNumber } from '../settings/settingsPhoneCountries';
import { isValidE164Phone, normalizeCanonicalPhone } from '../settings/settingsContracts';
import { getPhoneOtpClient } from '../phoneOtp/iosPhoneOtpFoundation';
import { performPhoneOtpOnboardingLogout } from '../phoneOtp/onboardingLogout';
import {
  createPhoneOtpController,
  type PhoneOtpController,
  type PhoneOtpViewState,
} from '../phoneOtp/phoneOtpController';

type ScreenPhase = 'capture' | 'confirm' | 'code' | 'success' | 'terminal';

function isValidPhone(fullPhone: string) {
  return isValidE164Phone(normalizeCanonicalPhone(fullPhone));
}

export default function PhoneVerificationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t, i18n } = useTranslation();

  const controllerRef = useRef<PhoneOtpController | null>(null);
  const aliveRef = useRef(true);
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

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    const result = await performPhoneOtpOnboardingLogout({
      controller: controllerRef.current,
      signOut: () => firebaseAuth.signOut(),
      clearSensitiveLocalState: () => {
        setLocalPhone('');
        setShowCountries(false);
        controllerRef.current = null;
      },
    });
    if (!aliveRef.current) return;
    if (result.ok === false) {
      setSignOutError(t(result.messageKey));
      setSigningOut(false);
      return;
    }
    setSigningOut(false);
  }

  const busy = (view?.operationInFlight ?? false) || signingOut;

  const signOutFooter = (
    <View style={styles.signOutWrap}>
      {signOutError ? (
        <Text
          style={[styles.error, { color: palette.danger }]}
          accessibilityRole="alert"
        >
          {signOutError}
        </Text>
      ) : null}
      <Pressable
        onPress={() => {
          void onSignOut();
        }}
        disabled={signingOut}
        style={styles.signOutBtn}
        accessibilityRole="button"
        accessibilityLabel={t('phoneOtp.a11y.signOutButton')}
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
      >
        <Text style={[styles.signOutText, { color: palette.danger }]}>
          {signingOut ? t('phoneOtp.signOut.signingOut') : t('phoneOtp.signOut.label')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <RegistrationLayout>
      <RegistrationProgress progress={authPhaseProgress(3, 4)} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!view ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={palette.primary} />
              <Text style={[styles.hint, { color: palette.textSecondary }]}>
                {t('phoneOtp.states.loading')}
              </Text>
              {signOutFooter}
            </View>
          ) : (
            <RegistrationFadeSlideIn>
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
                  {signOutFooter}
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
                  <Pressable onPress={onChangeNumber} style={styles.linkBtn}>
                    <Text style={{ color: palette.primary }}>
                      {t('phoneOtp.confirmStep.changeNumber')}
                    </Text>
                  </Pressable>
                  {signOutFooter}
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
                  <Pressable
                    onPress={onResend}
                    disabled={!canResend || busy}
                    style={styles.linkBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('phoneOtp.a11y.resendButton')}
                  >
                    <Text style={{ color: canResend ? palette.primary : palette.textSecondary }}>
                      {canResend
                        ? t('phoneOtp.codeStep.resend')
                        : t('phoneOtp.codeStep.resendIn', { seconds: resendSeconds })}
                    </Text>
                  </Pressable>
                  <Pressable onPress={onChangeNumber} style={styles.linkBtn}>
                    <Text style={{ color: palette.primary }}>
                      {t('phoneOtp.codeStep.changeNumber')}
                    </Text>
                  </Pressable>
                  {signOutFooter}
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
                  <Pressable
                    onPress={() => {
                      void onRetryBootstrap();
                    }}
                    disabled={busy}
                    style={styles.linkBtn}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: palette.primary }}>
                      {t('phoneOtp.states.retryBootstrap')}
                    </Text>
                  </Pressable>
                  {signOutFooter}
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
                  {signOutFooter}
                </>
              )}
            </RegistrationFadeSlideIn>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </RegistrationLayout>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.base,
    marginBottom: spacing.lg,
    lineHeight: 22,
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
  linkBtn: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  signOutWrap: {
    marginTop: spacing.md,
  },
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  signOutText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  icon: { alignSelf: 'center', marginBottom: spacing.md },
});
