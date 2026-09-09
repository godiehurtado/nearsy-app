import activeProfileMode from '../resources/activeProfileMode';
import alignment from '../resources/alignment';
import { authenticationTranslations } from '../resources/authentication';
import { commonTranslations } from '../resources/common';
import discoveryProfile from '../resources/discoveryProfile';
import home from '../resources/home';
import nearby from '../resources/nearby';
import notifications from '../resources/notifications';
import { onboardingTranslations } from '../resources/onboarding';
import { phoneOtpTranslations } from '../resources/phoneOtp';
import { profileTranslations } from '../resources/profile';
import settings from '../resources/settings';
import { validationTranslations } from '../resources/validation';

export const en = {
  common: commonTranslations.en,
  validation: validationTranslations.en,
  authentication: authenticationTranslations.en,
  onboarding: onboardingTranslations.en,
  home,
  nearby,
  profile: profileTranslations.en,
  discoveryProfile,
  alignment,
  activeProfileMode,
  notifications,
  settings,
  phoneOtp: phoneOtpTranslations.en,
} as const;

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends object
      ? DeepStringRecord<T[K]>
      : T[K];
};

export type TranslationResources = DeepStringRecord<typeof en>;
