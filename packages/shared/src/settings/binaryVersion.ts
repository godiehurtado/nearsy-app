/**
 * Version and build of the installed binary, as the native bundle reports them.
 * Never the app config or a remote update manifest. Platforms without the
 * native module return null and show nothing.
 */
export type BinaryVersion = { version: string; build: string };

const VERSION = /^\d+(\.\d+){0,3}$/;
const BUILD = /^[0-9A-Za-z.]{1,20}$/;

export function formatBinaryVersion(
  version: unknown,
  build: unknown,
): BinaryVersion | null {
  if (typeof version !== 'string' || typeof build !== 'string') return null;
  const v = version.trim();
  const b = build.trim();
  if (!VERSION.test(v) || !BUILD.test(b)) return null;
  return { version: v, build: b };
}

export function readBinaryVersion(): BinaryVersion | null {
  return null;
}
