/**
 * Build-time Logo.dev publishable-key validation.
 * Never logs or returns descriptors that include the key value.
 */
'use strict';

const LOGO_DEV_PUBLISHABLE_KEY_ENV = 'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY';

/**
 * @param {unknown} raw
 */
function describeLogoDevPublishableKey(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return {
    envName: LOGO_DEV_PUBLISHABLE_KEY_ENV,
    keyPresent: trimmed.length > 0,
    publishablePrefix: trimmed.startsWith('pk_'),
    secretPrefix: trimmed.startsWith('sk_'),
  };
}

/**
 * @param {unknown} raw
 * @param {{ required?: boolean }} [options]
 * @returns {string | undefined}
 */
function resolveLogoDevPublishableKey(raw, options = {}) {
  const required = Boolean(options.required);
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    if (required) {
      throw new Error(
        `[app.config] Missing required environment variable: ${LOGO_DEV_PUBLISHABLE_KEY_ENV}`,
      );
    }
    return undefined;
  }
  if (trimmed.startsWith('sk_')) {
    throw new Error(
      `[app.config] ${LOGO_DEV_PUBLISHABLE_KEY_ENV} must be a publishable pk_ key, not a secret.`,
    );
  }
  if (!trimmed.startsWith('pk_')) {
    throw new Error(
      `[app.config] ${LOGO_DEV_PUBLISHABLE_KEY_ENV} must start with pk_.`,
    );
  }
  return trimmed;
}

module.exports = {
  LOGO_DEV_PUBLISHABLE_KEY_ENV,
  describeLogoDevPublishableKey,
  resolveLogoDevPublishableKey,
};
