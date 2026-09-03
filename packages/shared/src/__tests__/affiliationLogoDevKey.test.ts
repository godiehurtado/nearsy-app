import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  buildLogoDevImageUrl,
  domainFromAffiliationFields,
  isLogoDevPublishableKey,
} from '../affiliations/affiliationLogoDev';
import {
  describeAffiliationLogoRuntime,
  LOGO_DEV_PUBLISHABLE_KEY_ENV,
  readLogoDevPublishableKey,
} from '../affiliations/affiliationLogoDevConfig';

const PLACEHOLDER_PK = 'pk_test_placeholder';
const PLACEHOLDER_SK = 'sk_test_secret';

const previous = process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV];

afterEach(() => {
  if (previous === undefined) {
    delete process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV];
  } else {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = previous;
  }
});

describe('Logo.dev publishable key runtime', () => {
  it('treats a missing key as absent and keeps initials fallback', () => {
    delete process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV];
    assert.equal(readLogoDevPublishableKey(), undefined);
    assert.equal(isLogoDevPublishableKey(undefined), false);
    assert.equal(buildLogoDevImageUrl('microsoft.com', undefined), undefined);
    assert.equal(describeAffiliationLogoRuntime().keyPresent, false);
  });

  it('accepts a pk_ prefix without using a real token', () => {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = PLACEHOLDER_PK;
    assert.equal(isLogoDevPublishableKey(PLACEHOLDER_PK), true);
    assert.equal(readLogoDevPublishableKey(), PLACEHOLDER_PK);
    assert.equal(
      buildLogoDevImageUrl('microsoft.com', PLACEHOLDER_PK),
      `https://img.logo.dev/microsoft.com?token=${PLACEHOLDER_PK}`,
    );
  });

  it('rejects sk_ secrets', () => {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = PLACEHOLDER_SK;
    assert.equal(isLogoDevPublishableKey(PLACEHOLDER_SK), false);
    assert.equal(readLogoDevPublishableKey(), undefined);
    assert.equal(buildLogoDevImageUrl('microsoft.com', PLACEHOLDER_SK), undefined);
  });

  it('reconstructs HTTPS img.logo.dev URL for persisted affiliation without logoUrl (DEV/PROD)', () => {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = PLACEHOLDER_PK;
    const domain = domainFromAffiliationFields({
      website: 'https://microsoft.com',
      providerId: 'logo.dev:microsoft.com',
    });
    const url = buildLogoDevImageUrl(domain, readLogoDevPublishableKey());
    assert.equal(
      url,
      `https://img.logo.dev/microsoft.com?token=${PLACEHOLDER_PK}`,
    );
  });

  it('reconstructs from providerId domain when website missing', () => {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = PLACEHOLDER_PK;
    const domain = domainFromAffiliationFields({
      providerId: 'microsoft.com',
    });
    assert.equal(
      buildLogoDevImageUrl(domain, readLogoDevPublishableKey()),
      `https://img.logo.dev/microsoft.com?token=${PLACEHOLDER_PK}`,
    );
  });

  it('falls back safely when publishable key is missing', () => {
    delete process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV];
    const domain = domainFromAffiliationFields({
      website: 'https://microsoft.com',
    });
    assert.equal(
      buildLogoDevImageUrl(domain, readLogoDevPublishableKey()),
      undefined,
    );
  });

  it('descriptor never includes the key value or token=', () => {
    process.env[LOGO_DEV_PUBLISHABLE_KEY_ENV] = PLACEHOLDER_PK;
    const snapshot = describeAffiliationLogoRuntime();
    const encoded = JSON.stringify(snapshot);
    assert.equal(snapshot.host, 'img.logo.dev');
    assert.equal(snapshot.keyPresent, true);
    assert.equal(snapshot.envKeyPresent, true);
    assert.ok(!encoded.includes(PLACEHOLDER_PK));
    assert.ok(!encoded.includes('pk_'));
    assert.ok(!encoded.includes('sk_'));
    assert.ok(!encoded.includes('token='));
  });
});
