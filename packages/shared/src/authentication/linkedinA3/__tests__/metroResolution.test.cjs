/**
 * I1-H — prove Metro-style resolution of LinkedIn A3 foundation imports.
 * Uses Node resolution from the real .ios.ts location (no TS path aliases).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const FOUNDATION = path.resolve(
  __dirname,
  '../iosLinkedInA3Foundation.ios.ts',
);
const LINKEDIN_A3_ROOT = path.resolve(__dirname, '..');

function resolveRelativeFromFoundation(specifier) {
  assert.ok(
    specifier.startsWith('./') || specifier.startsWith('../'),
    `expected relative specifier, got ${specifier}`,
  );
  const fromDir = path.dirname(FOUNDATION);
  const absNoExt = path.resolve(fromDir, specifier);
  const candidates = [
    absNoExt,
    `${absNoExt}.ts`,
    `${absNoExt}.ios.ts`,
    `${absNoExt}.tsx`,
    path.join(absNoExt, 'index.ts'),
  ];
  const hit = candidates.find((c) => fs.existsSync(c));
  return { specifier, absNoExt, hit: hit || null, ok: !!hit };
}

describe('I1-H LinkedIn A3 Metro resolution', () => {
  it('foundation file exists at canonical path', () => {
    assert.equal(fs.existsSync(FOUNDATION), true);
  });

  it('resolves corrected sibling imports from iosLinkedInA3Foundation.ios.ts', () => {
    const specs = [
      './appCheck/appCheckBootstrap',
      './appCheck/nativeAppCheckPort',
      './environment/nearsyFirebaseEnvironment',
      './functions/linkedInA3CallableClient',
      './sanitize',
    ];
    for (const specifier of specs) {
      const result = resolveRelativeFromFoundation(specifier);
      assert.equal(
        result.ok,
        true,
        `unresolved ${specifier} → ${result.absNoExt}`,
      );
    }
  });

  it('rejects the broken parent-level imports Metro reported', () => {
    const broken = [
      '../appCheck/appCheckBootstrap',
      '../appCheck/nativeAppCheckPort',
      '../environment/nearsyFirebaseEnvironment',
      '../functions/linkedInA3CallableClient',
      '../sanitize',
    ];
    for (const specifier of broken) {
      const result = resolveRelativeFromFoundation(specifier);
      assert.equal(
        result.ok,
        false,
        `unexpectedly resolved broken path ${specifier} → ${result.hit}`,
      );
      // Metro tried authentication/appCheck/... (one level above linkedinA3)
      assert.match(
        result.absNoExt.replace(/\\/g, '/'),
        /\/authentication\/(appCheck|environment|functions|sanitize)/,
      );
    }
  });

  it('imports foundation via package entry surface (index → iosLinkedInA3Foundation)', () => {
    const indexPath = path.join(LINKEDIN_A3_ROOT, 'index.ts');
    const text = fs.readFileSync(indexPath, 'utf8');
    assert.match(text, /from '\.\/iosLinkedInA3Foundation'/);
    assert.equal(
      fs.existsSync(path.join(LINKEDIN_A3_ROOT, 'iosLinkedInA3Foundation.ios.ts')),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(LINKEDIN_A3_ROOT, 'iosLinkedInA3Foundation.ts')),
      true,
    );
  });
});
