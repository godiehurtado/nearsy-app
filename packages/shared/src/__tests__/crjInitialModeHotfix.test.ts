/**
 * Incident 2026-11-20 (CRJ initial Profile Type, Functions hotfix/visibility-absent-mode).
 *
 * Server contract (Functions PR #47): inside the CRJ selection window
 * (profileSetupCompleted !== true, visibility !== true, no discovery profile)
 * setActiveProfileMode accepts Personal or Professional on an incomplete face and
 * stores `mode`, answering ok with targetProfileComplete:false.
 *
 * Client side pinned here:
 * - resume never continues past Profile Type without a stored mode;
 * - step 1 applies the server's response mode and treats ok as the confirmation;
 * - completion and activation keep their requirements (nothing marked complete early).
 * Fixtures are synthetic.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CRJ_RESUME_STAGE_FIELD, resolveCrjResume } from '../onboarding/crjResume';
import { applyActiveProfileModeResponseToUserDoc } from '../visibility/activeProfileModeSync';

const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(
  join(here, '..', 'screens', 'ProfileCompletionScreen.tsx'),
  'utf8',
);

function shell(extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'synthetic@example.test',
    realName: '',
    visibility: false,
    profileImage: null,
    profileSetupCompleted: false,
    profiles: {
      personal: { profileImage: null, occupation: '', bio: '' },
      professional: { profileImage: null, occupation: '', bio: '', company: '' },
    },
    ...extras,
  };
}

describe('CRJ resume needs a stored mode', () => {
  it('a cursor past Profile Type with no stored mode resumes at Profile Type', () => {
    for (const cursor of ['v2:identity', 'v2:photo', 'v2:details', 'v2:affiliation:education']) {
      const resume = resolveCrjResume(shell({ [CRJ_RESUME_STAGE_FIELD]: cursor }));
      assert.equal(resume.step.kind, 'type', cursor);
    }
  });

  it('null or invalid stored modes also go back to Profile Type', () => {
    for (const mode of [null, '', 'business', 1]) {
      const resume = resolveCrjResume(
        shell({ mode, [CRJ_RESUME_STAGE_FIELD]: 'v2:details' }),
      );
      assert.equal(resume.step.kind, 'type', String(mode));
    }
  });

  it('a stored Personal or Professional keeps the named cursor', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const resume = resolveCrjResume(
        shell({ mode, [CRJ_RESUME_STAGE_FIELD]: 'v2:details' }),
      );
      assert.equal(resume.source, 'named-cursor', mode);
      assert.equal(resume.step.kind, 'details', mode);
    }
  });

  it('a fresh shell starts at Profile Type', () => {
    assert.equal(resolveCrjResume(shell()).step.kind, 'type');
  });
});

describe('Profile Type step uses the server answer', () => {
  it('an ok answer with an incomplete target stores the requested mode locally', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const doc = applyActiveProfileModeResponseToUserDoc(shell(), {
        contractVersion: 1,
        mode,
        visibility: false,
        targetProfileComplete: false,
        discoverySynced: false,
        serverTime: 1_700_000_000_000,
      } as any);
      assert.equal(doc.mode, mode);
      assert.equal(doc.visibility, false);
      assert.equal(doc.profileSetupCompleted, false);
    }
  });

  it('persistType calls setActiveProfileMode, throws on errors and applies response.mode', () => {
    const start = screen.indexOf('async function persistType()');
    const body = screen.slice(start, screen.indexOf('async function persistName()', start));
    assert.match(body, /setActiveProfileModeFlow\(client, mode, uid\)/);
    assert.match(body, /if \(outcome\.ok === false\) \{\s*throw outcome\.error;/);
    assert.match(body, /mode: outcome\.response\.mode/);
    assert.doesNotMatch(body, /profileSetupCompleted/);
  });

  it('only finishOnboarding sets profileSetupCompleted to true, before activation', () => {
    const trueWrites = screen.match(/profileSetupCompleted: true/g) ?? [];
    assert.equal(trueWrites.length, 1);
    const finish = screen.indexOf('async function finishOnboarding()');
    const write = screen.indexOf('profileSetupCompleted: true', finish);
    const activate = screen.indexOf('attemptInitialVisibilityAfterCrjCompletion(', finish);
    assert.ok(finish > 0 && write > finish && activate > write);
  });
});
