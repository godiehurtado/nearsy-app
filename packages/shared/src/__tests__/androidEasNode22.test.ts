/**
 * Pins EAS Android builders to Node 22.23.4 (Oct 2026 security release).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidEasNode22.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const PINNED_NODE = '22.23.4';

type EasBuildProfile = {
  extends?: string;
  node?: string;
  env?: Record<string, string>;
};

type EasJson = {
  build?: Record<string, EasBuildProfile>;
};

function readRepo(relativeFromRoot: string): string {
  return readFileSync(join(repoRoot, relativeFromRoot), 'utf8');
}

function resolvedNode(
  profiles: Record<string, EasBuildProfile>,
  name: string,
  seen: Set<string> = new Set(),
): string | undefined {
  if (seen.has(name)) {
    throw new Error(`eas.json cycle at profile "${name}"`);
  }
  seen.add(name);
  const profile = profiles[name];
  assert.ok(profile, `missing eas profile "${name}"`);
  if (typeof profile.node === 'string' && profile.node.trim()) {
    return profile.node;
  }
  if (profile.extends) {
    return resolvedNode(profiles, profile.extends, seen);
  }
  return undefined;
}

describe('Android EAS Node 22 security pin', () => {
  it('eas.json is valid JSON with official node field on every Android profile', () => {
    const raw = readRepo('apps/nearsy-android/eas.json');
    const eas = JSON.parse(raw) as EasJson;
    const profiles = eas.build ?? {};

    assert.deepEqual(Object.keys(profiles).sort(), [
      'development',
      'development-nearsy-dev',
      'preview',
      'production',
    ]);

    assert.equal(profiles.development?.node, PINNED_NODE);
    assert.equal(profiles.preview?.node, PINNED_NODE);
    assert.equal(profiles.production?.node, PINNED_NODE);
    assert.equal(profiles['development-nearsy-dev']?.extends, 'development');
    assert.equal(
      profiles['development-nearsy-dev']?.node,
      undefined,
      'child profile should inherit node from development',
    );

    for (const name of Object.keys(profiles)) {
      assert.equal(resolvedNode(profiles, name), PINNED_NODE, name);
      assert.notEqual(profiles[name]?.env?.EXPO_NODE_VERSION, PINNED_NODE);
      assert.equal(profiles[name]?.env?.EXPO_NODE_VERSION, undefined);
    }
  });

  it('SDK 54 engines allow the pinned Node 22 patch', () => {
    const pkg = JSON.parse(
      readRepo('apps/nearsy-android/package.json'),
    ) as { engines?: { node?: string }; dependencies?: { expo?: string } };
    assert.match(String(pkg.dependencies?.expo ?? ''), /~54\./);
    const engines = pkg.engines?.node ?? '';
    assert.match(engines, /<=22/);
    assert.match(PINNED_NODE, /^22\./);
  });
});
