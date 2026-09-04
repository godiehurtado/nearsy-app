/** Scope token for flat-category Other composer (never a real group id). */
export const FLAT_OTHER_SCOPE = '__flat__';

export function otherScopeForGroup(groupId?: string): string {
  return groupId ?? FLAT_OTHER_SCOPE;
}

export function isOtherComposerOpen(
  openScope: string | null,
  groupId?: string,
): boolean {
  if (openScope == null) return false;
  return openScope === otherScopeForGroup(groupId);
}
