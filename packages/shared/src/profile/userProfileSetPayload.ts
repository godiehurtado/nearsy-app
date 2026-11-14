/**
 * Per-mode face contract C1/C2 (see profileModeFields): the set-merge payload
 * for a users/{uid} patch. "profiles.<mode>.<field>" keys become a real nested
 * map, and the same atomic write deletes the literal top-level fields with
 * those names (setDoc never parses dotted keys, which is how they came to
 * exist). Pure: the delete sentinel is injected (Firestore deleteField).
 */
import { splitFacePatch } from './profileModeFields';

export function buildUserProfileSetPayload(
  patch: Record<string, unknown>,
  deleteSentinel: () => unknown,
): Record<string, unknown> {
  const { rest, faces, literalKeysToDelete } = splitFacePatch(patch);
  const payload: Record<string, unknown> = { ...rest };
  const modes = Object.keys(faces) as Array<keyof typeof faces>;
  if (modes.length > 0) {
    const profiles: Record<string, unknown> = {
      ...((rest.profiles as Record<string, unknown> | undefined) ?? {}),
    };
    for (const mode of modes) {
      profiles[mode] = {
        ...((profiles[mode] as Record<string, unknown> | undefined) ?? {}),
        ...faces[mode],
      };
    }
    payload.profiles = profiles;
  }
  for (const key of literalKeysToDelete) payload[key] = deleteSentinel();
  return payload;
}
