/**
 * S256 client possession proof for TikTok ownership (not provider PKCE).
 */
export {
  assertClientProofChallengeShape,
  assertClientProofVerifierShape,
  createClientProofPair,
  createS256ClientProofChallenge,
  generateClientProofVerifier,
  type ClientProofCrypto,
} from '../youtubeOwnership/youtubeOwnershipProof.ts';
