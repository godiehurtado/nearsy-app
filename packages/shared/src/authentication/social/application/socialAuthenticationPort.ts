import type { ProviderAuthenticationResult } from '../domain/providerAuthenticationResult';
import type {
  SocialAuthProvider,
  SocialAuthenticationRequest,
} from '../domain/socialAuthProvider';

/**
 * Provider adapter contract (ADR-010). Adapters must not write Firestore,
 * navigate, or exchange Firebase credentials.
 */
export interface SocialAuthenticationProviderAdapter {
  readonly provider: SocialAuthProvider;
  isAvailable(): Promise<boolean>;
  configure(): Promise<void>;
  authenticate(
    request: SocialAuthenticationRequest,
  ): Promise<ProviderAuthenticationResult>;
  clearProviderSession?(): Promise<void>;
}
