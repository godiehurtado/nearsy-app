import { authenticationTranslations } from '../resources/authentication';
import { commonTranslations } from '../resources/common';
import { homeTranslations } from '../resources/home';
import { nearbyTranslations } from '../resources/nearby';
import { notificationsTranslations } from '../resources/notifications';
import { onboardingTranslations } from '../resources/onboarding';
import { phoneOtpTranslations } from '../resources/phoneOtp';
import { profileTranslations } from '../resources/profile';
import { settingsTranslations } from '../resources/settings';
import { validationTranslations } from '../resources/validation';

export const en = {
  common: commonTranslations.en,
  validation: validationTranslations.en,
  authentication: authenticationTranslations.en,
  onboarding: onboardingTranslations.en,
  home: homeTranslations.en,
  nearby: nearbyTranslations.en,
  profile: profileTranslations.en,
  notifications: notificationsTranslations.en,
  settings: settingsTranslations.en,
  phoneOtp: phoneOtpTranslations.en,
} as const;

export type TranslationResources = typeof en;
