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

export const es = {
  common: commonTranslations.es,
  validation: validationTranslations.es,
  authentication: authenticationTranslations.es,
  onboarding: onboardingTranslations.es,
  home: homeTranslations.es,
  nearby: nearbyTranslations.es,
  profile: profileTranslations.es,
  notifications: notificationsTranslations.es,
  settings: settingsTranslations.es,
  phoneOtp: phoneOtpTranslations.es,
} as const;
