/**
 * Client-safe Logo.dev image URL helper.
 * Never accepts or embeds a secret sk_ key.
 */

export const LOGO_DEV_IMAGE_HOST = 'img.logo.dev';

export function normalizeAffiliationDomain(
  value?: string | null,
): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutScheme = trimmed.replace(/^https?:\/\//i, '');
  const host = withoutScheme.split('/')[0]?.split('?')[0] ?? '';
  const domain = host.replace(/^www\./, '');
  if (!domain || !domain.includes('.')) return null;
  if (domain.includes('..') || /[^a-z0-9.-]/.test(domain)) return null;
  return domain;
}

export function isLogoDevPublishableKey(value?: string | null): boolean {
  const key = String(value ?? '').trim();
  return key.startsWith('pk_') && key.length > 6 && !key.startsWith('sk_');
}

export function isEphemeralProviderLogoUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    /img\.logo\.dev/i.test(url) ||
    /[?&]token=/i.test(url)
  );
}

export function buildLogoDevImageUrl(
  domain: string | null | undefined,
  publishableKey: string | null | undefined,
): string | undefined {
  const normalized = normalizeAffiliationDomain(domain);
  if (!normalized) return undefined;
  if (!isLogoDevPublishableKey(publishableKey)) return undefined;
  return `https://${LOGO_DEV_IMAGE_HOST}/${normalized}?token=${publishableKey!.trim()}`;
}

export function domainFromAffiliationFields(input: {
  website?: string | null;
  providerId?: string | null;
  domain?: string | null;
}): string | null {
  return (
    normalizeAffiliationDomain(input.domain) ||
    normalizeAffiliationDomain(input.website) ||
    normalizeAffiliationDomain(
      input.providerId && !input.providerId.startsWith('logo.dev:')
        ? input.providerId
        : input.providerId?.replace(/^logo\.dev:/i, ''),
    )
  );
}
