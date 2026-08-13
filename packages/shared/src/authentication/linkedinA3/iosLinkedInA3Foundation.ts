import { LinkedInA3ClientError } from './sanitize';

export function getLinkedInA3AppCheckState() {
  return 'not_initialized' as const;
}

export function getLinkedInA3CallableClient(): Promise<never> {
  return Promise.reject(
    new LinkedInA3ClientError(
      'LINKEDIN_DISABLED',
      'LinkedIn A3 foundation is only available on iOS.',
    ),
  );
}
