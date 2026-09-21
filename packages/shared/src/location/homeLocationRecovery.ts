/**
 * Decide whether Home should force full background education after reinstall.
 * Local education mark (this install) controls — remote Visibility/bgVisible
 * and even OS background granted must NOT suppress the offer when mark absent.
 */

export function shouldForceFullBackgroundEducation(input: {
  localEducationSeen: boolean;
  /** When true, Home owns one recovery offer this session. */
  recoveryNeeded: boolean;
}): boolean {
  if (input.localEducationSeen) return false;
  return input.recoveryNeeded === true;
}

/**
 * Home Visibility toggle disabled only for hydration / real mutation —
 * never for bgVisible, BG permission, education, or Settings intent.
 */
export function isVisibilityToggleDisabled(input: {
  hydrating: boolean;
  mutating: boolean;
}): boolean {
  return input.hydrating === true || input.mutating === true;
}
