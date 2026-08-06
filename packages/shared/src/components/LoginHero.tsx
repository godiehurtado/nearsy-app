import React from 'react';
import { NearsyBrandHero } from './NearsyBrandHero';

/**
 * LoginHero — Login brand block.
 * Delegates to NearsyBrandHero (shared with Welcome) so logo, waves, and
 * people illustration stay identical to the approved Login presentation.
 */
export function LoginHero() {
  return <NearsyBrandHero />;
}
