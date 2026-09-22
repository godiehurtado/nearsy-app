/**
 * Dev-client bundle identity (BUG-DISC-05 physical QA).
 * Set EXPO_PUBLIC_GIT_SHA when starting Metro so the phone can confirm the served commit.
 */

export function getServedGitSha(): string {
  const raw = process.env.EXPO_PUBLIC_GIT_SHA;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return 'unknown';
}

export function getServedGitShaShort(): string {
  const full = getServedGitSha();
  if (full === 'unknown') return full;
  return full.slice(0, 7);
}
