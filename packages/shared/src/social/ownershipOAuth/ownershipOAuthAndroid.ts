/**
 * Android Linking port for ownership OAuth resume.
 * Does not Start, Exchange, or open a browser.
 */
import { Linking } from 'react-native';
import type { OwnershipLinkingPort } from './ownershipOAuthCoordinator.ts';

export function createOwnershipLinkingPort(): OwnershipLinkingPort {
  return {
    getInitialURL: () => Linking.getInitialURL(),
    addEventListener: (type, handler) => Linking.addEventListener(type, handler),
  };
}
