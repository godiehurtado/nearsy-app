import authentication from '../resources/authentication';
import common from '../resources/common';
import home from '../resources/home';
import nearby from '../resources/nearby';
import notifications from '../resources/notifications';
import onboarding from '../resources/onboarding';
import profile from '../resources/profile';
import settings from '../resources/settings';
import validation from '../resources/validation';

const en = {
  common,
  validation,
  authentication,
  onboarding,
  home,
  nearby,
  profile,
  notifications,
  settings,
} as const;

export default en;

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends object
      ? DeepStringRecord<T[K]>
      : T[K];
};

export type TranslationResources = DeepStringRecord<typeof en>;
