/**
 * Address-book limit announced by Identity (contract v1, additive
 * `identifierCap`). It is both the maximum entries in one request's
 * `identifiers[]` and the maximum unique hashes in the union of live sources.
 * Identity enforces it regardless; the client uses it only to refuse early.
 *
 * - Accepted only as a safe integer >= 1; the effective limit is
 *   min(identifierCap, CLIENT_MAX_IDENTIFIER_CAP).
 * - Missing or invalid (older server): LEGACY_IDENTIFIER_CAP.
 * - Kept in memory from the latest server response only, never persisted.
 */

export const LEGACY_IDENTIFIER_CAP = 500;
export const CLIENT_MAX_IDENTIFIER_CAP = 5000;

export function parseIdentifierCap(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

export function effectiveIdentifierCap(serverCap: number | null): number {
  return serverCap === null
    ? LEGACY_IDENTIFIER_CAP
    : Math.min(serverCap, CLIENT_MAX_IDENTIFIER_CAP);
}

let lastServerCap: number | null = null;
let answered = false;

/** Records the cap from a successful Identity response (absent means older server). */
export function noteServerIdentifierCap(result: { identifierCap?: unknown }): void {
  answered = true;
  lastServerCap = parseIdentifierCap(result.identifierCap);
}

export function currentIdentifierCap(): { cap: number; serverAnswered: boolean } {
  return { cap: effectiveIdentifierCap(lastServerCap), serverAnswered: answered };
}

export function resetIdentifierCapForTests(): void {
  lastServerCap = null;
  answered = false;
}
