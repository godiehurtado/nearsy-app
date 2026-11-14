/**
 * QA 2.1.0 blocker 1: per-mode profile faces (contract C1–C7, agreed with iOS
 * and Functions). Root cause on Android: face saves sent "profiles.<mode>.<field>"
 * keys through set(merge), which Firestore stores as literal top-level fields,
 * so the nested face stayed empty; and an Own Profile save of the INACTIVE face
 * also mirrored it to top level, overwriting the active face.
 *
 * `simulateSetMerge` applies a payload with Firestore set(merge) semantics
 * (keys are field names, maps merge deeply, the delete sentinel removes the
 * field), so the scenarios below run on the exact payloads the app writes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyProfileSavePatchToDoc,
  buildActiveProfileSavePatch,
  literalFaceKey,
  readFaceField,
  resolveModePresentation,
  type ProfileMode,
} from '../profile/profileModeFields.ts';
import { buildOwnProfileSavePatch, type OwnProfileDraft } from '../profile/ownProfileEditorState.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(here, '..', rel), 'utf8');

const DEL = Symbol('FieldValue.delete');
type Doc = Record<string, unknown>;

function simulateSetMerge(stored: Doc, payload: Doc): Doc {
  const out: Doc = { ...stored };
  for (const [key, value] of Object.entries(payload)) {
    if (value === DEL) {
      delete out[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const prev = out[key] && typeof out[key] === 'object' ? (out[key] as Doc) : {};
      out[key] = simulateSetMerge(prev, value as Doc);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const personalDraft: OwnProfileDraft = {
  realName: 'Ana',
  lastName: 'Personal',
  profileImage: 'https://img.example/personal.jpg',
  occupation: 'Painter',
  bio: 'Personal bio',
  company: '',
};
const professionalDraft: OwnProfileDraft = {
  realName: 'Ana María',
  lastName: 'Profesional',
  profileImage: 'https://img.example/pro.jpg',
  occupation: 'CTO',
  bio: 'Professional bio',
  company: 'Nearsy',
};

function ownSave(stored: Doc, face: ProfileMode, draft: OwnProfileDraft): Doc {
  const patch = buildOwnProfileSavePatch({
    mode: face,
    draft,
    activeMode: (stored.mode as ProfileMode) ?? null,
    literalDelete: DEL,
  });
  return simulateSetMerge(stored, patch);
}

function face(doc: Doc, mode: ProfileMode) {
  const p = resolveModePresentation(doc, mode);
  return { realName: p.realName, lastName: p.lastName, occupation: p.occupation, bio: p.bio, company: p.company, profileImage: p.profileImage };
}

describe('C3 read precedence', () => {
  it('literal, then nested, then top level only for the stored active mode', () => {
    const doc: Doc = {
      mode: 'personal',
      occupation: 'TopLevel',
      profiles: { personal: { occupation: 'Nested' } },
      [literalFaceKey('personal', 'occupation')]: 'Literal',
    };
    assert.equal(readFaceField(doc, 'personal', 'occupation'), 'Literal');
    delete doc[literalFaceKey('personal', 'occupation')];
    assert.equal(readFaceField(doc, 'personal', 'occupation'), 'Nested');
    doc.profiles = {};
    assert.equal(readFaceField(doc, 'personal', 'occupation'), 'TopLevel');
    // The inactive face never borrows top level.
    assert.equal(readFaceField(doc, 'professional', 'occupation'), null);
  });

  it('absent `profiles` (affected account shape) and blank values fall through', () => {
    const doc: Doc = {
      mode: 'professional',
      realName: 'Top',
      [literalFaceKey('professional', 'company')]: 'LitCo',
      [literalFaceKey('personal', 'realName')]: '   ',
    };
    assert.equal(readFaceField(doc, 'professional', 'company'), 'LitCo');
    assert.equal(readFaceField(doc, 'professional', 'realName'), 'Top');
    assert.equal(readFaceField(doc, 'personal', 'realName'), null);
    assert.equal(readFaceField({ profiles: 'garbage' } as Doc, 'personal', 'bio'), null);
    assert.equal(readFaceField(null, 'personal', 'bio'), null);
  });
});

describe('C1/C2 write payload', () => {
  it('writes a real nested face and deletes only the written literal twins', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'professional',
      presentation: { realName: 'Ana', occupation: '   ', company: 'Nearsy' },
      includeModeInPatch: false,
      literalDelete: DEL,
    });
    assert.deepEqual(patch.profiles, { professional: { realName: 'Ana', company: 'Nearsy' } });
    assert.equal(patch[literalFaceKey('professional', 'realName')], DEL);
    assert.equal(patch[literalFaceKey('professional', 'company')], DEL);
    // Blank occupation: nothing written, its literal kept.
    assert.equal(literalFaceKey('professional', 'occupation') in patch, false);
    // Never the other mode, never top level unless asked, never mode.
    assert.equal(Object.keys(patch).some((k) => k.includes('personal')), false);
    assert.equal('realName' in patch || 'company' in patch || 'mode' in patch, false);
  });

  it('nothing to write writes nothing (no empty map, no deletes)', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: { realName: ' ', bio: '' },
      includeModeInPatch: false,
      literalDelete: DEL,
    });
    assert.deepEqual(patch, {});
  });

  it('Own Profile mirrors to top level only for the confirmed active face', () => {
    const active = buildOwnProfileSavePatch({ mode: 'personal', draft: personalDraft, activeMode: 'personal', literalDelete: DEL });
    assert.equal(active.realName, 'Ana');
    const inactive = buildOwnProfileSavePatch({ mode: 'professional', draft: professionalDraft, activeMode: 'personal', literalDelete: DEL });
    for (const key of ['realName', 'lastName', 'profileImage', 'occupation', 'bio', 'company', 'mode']) {
      assert.equal(key in inactive, false, key);
    }
    const unknown = buildOwnProfileSavePatch({ mode: 'personal', draft: personalDraft, activeMode: null, literalDelete: DEL });
    assert.equal('realName' in unknown, false);
  });
});

describe('scenarios on the written payloads (save, switch, restart, relogin)', () => {
  const personalOnly: Doc = {
    mode: 'personal',
    realName: 'Ana',
    lastName: 'Personal',
    profileImage: 'https://img.example/personal.jpg',
    occupation: 'Painter',
    bio: 'Personal bio',
    profiles: { personal: { realName: 'Ana', lastName: 'Personal', occupation: 'Painter', bio: 'Personal bio', profileImage: 'https://img.example/personal.jpg' } },
  };

  it('creating Professional from a Personal account persists it and leaves Personal intact', () => {
    const stored = ownSave(personalOnly, 'professional', professionalDraft);
    // "Logout/login": everything is re-read from the stored document only.
    assert.deepEqual(face(stored, 'professional'), {
      realName: 'Ana María', lastName: 'Profesional', occupation: 'CTO', bio: 'Professional bio', company: 'Nearsy', profileImage: 'https://img.example/pro.jpg',
    });
    assert.deepEqual(face(stored, 'personal'), face(personalOnly, 'personal'));
    // The active face's top level was not overwritten.
    assert.equal(stored.realName, 'Ana');
    assert.equal(stored.occupation, 'Painter');
  });

  it('Professional → Personal → Professional keeps both faces apart', () => {
    let stored = ownSave(personalOnly, 'professional', professionalDraft);
    stored = { ...stored, mode: 'professional' }; // server switch (mode only)
    const proAfterSwitch = face(stored, 'professional');
    stored = ownSave(stored, 'professional', { ...professionalDraft, bio: 'Pro v2' });
    stored = { ...stored, mode: 'personal' };
    stored = ownSave(stored, 'personal', { ...personalDraft, occupation: 'Sculptor' });
    stored = { ...stored, mode: 'professional' };
    assert.deepEqual(face(stored, 'professional'), { ...proAfterSwitch, bio: 'Pro v2' });
    assert.equal(face(stored, 'personal').occupation, 'Sculptor');
    assert.equal(face(stored, 'personal').realName, 'Ana');
    assert.equal(face(stored, 'personal').company, '');
  });

  it('a document written by older builds (literal fields, no nested map) reads and repairs per field', () => {
    // Affected-account shape: no `profiles`, literal faces, top level = last save.
    const legacy: Doc = {
      mode: 'professional',
      realName: 'Ana María',
      occupation: 'CTO',
      [literalFaceKey('personal', 'realName')]: 'Ana',
      [literalFaceKey('personal', 'occupation')]: 'Painter',
      [literalFaceKey('professional', 'realName')]: 'Ana María',
      [literalFaceKey('professional', 'company')]: 'Nearsy',
    };
    assert.equal(face(legacy, 'personal').realName, 'Ana');
    assert.equal(face(legacy, 'personal').occupation, 'Painter');
    assert.equal(face(legacy, 'professional').company, 'Nearsy');
    // Saving only the professional company moves that one field; nothing else changes.
    const patch = buildActiveProfileSavePatch({
      mode: 'professional',
      presentation: { company: 'Nearsy Labs' },
      projectActiveToTopLevel: true,
      includeModeInPatch: false,
      literalDelete: DEL,
    });
    const stored = simulateSetMerge(legacy, patch);
    assert.equal(face(stored, 'professional').company, 'Nearsy Labs');
    assert.equal(literalFaceKey('professional', 'company') in stored, false);
    assert.equal(stored[literalFaceKey('professional', 'realName')], 'Ana María');
    assert.deepEqual(face(stored, 'personal'), face(legacy, 'personal'));
  });

  it('an old public build writing a literal after a new save is still read (newest wins)', () => {
    let stored = ownSave(personalOnly, 'personal', personalDraft);
    stored = simulateSetMerge(stored, { [literalFaceKey('personal', 'bio')]: 'Written by build 51' });
    assert.equal(face(stored, 'personal').bio, 'Written by build 51');
  });

  it('the local copy after a save equals what a fresh read would show (restart parity)', () => {
    const patch = buildOwnProfileSavePatch({ mode: 'professional', draft: professionalDraft, activeMode: 'personal', literalDelete: DEL });
    const local = applyProfileSavePatchToDoc(personalOnly, patch);
    const stored = simulateSetMerge(personalOnly, patch);
    for (const mode of ['personal', 'professional'] as const) {
      assert.deepEqual(face(local, mode), face(stored, mode), mode);
    }
    assert.equal(Object.keys(local).some((k) => k.startsWith('profiles.')), false);
    assert.ok((local.profiles as Doc).personal, 'the other face is kept locally');
  });
});

describe('wiring', () => {
  it('Own Profile passes the stored active mode and the delete sentinel; no patch spread', () => {
    const screen = read('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /buildOwnProfileSavePatch\(\{\s*mode: faceMode,\s*draft: persistedDraft,[^}]*activeMode: mode,\s*literalDelete: firestoreDeleteField\(\),/);
    assert.match(screen, /applyProfileSavePatchToDoc\(/);
    // The write payload may spread the patch; local state must not.
    assert.doesNotMatch(screen, /\{\s*\.\.\.docWithoutCity,\s*\.\.\.modePatch/);
    assert.match(screen, /const writePatch = \{ \.\.\.modePatch, \.\.\.contextPatch, \.\.\.cityPatch \}/);
  });

  it('CRJ saves delete literal twins and build local state from the nested result', () => {
    const crj = read('screens/ProfileCompletionScreen.tsx');
    assert.equal((crj.match(/literalDelete: firestoreDeleteField\(\)/g) ?? []).length, 3);
    assert.equal((crj.match(/applyProfileSavePatchToDoc\(/g) ?? []).length, 3);
    // Local state is never a spread of a face patch (it would drop the other face).
    // Other CRJ patches (interests, affiliations, socials, gallery) use flat
    // per-mode fields and are out of scope.
    const body = (name: string, next: string) =>
      crj.slice(crj.indexOf(`async function ${name}(`), crj.indexOf(`async function ${next}(`));
    for (const [name, next] of [
      ['persistName', 'persistPhoto'],
      ['persistPhoto', 'persistDetails'],
      ['persistDetails', 'persistInterests'],
    ]) {
      const fn = body(name, next);
      assert.ok(fn.length > 100, name);
      assert.match(fn, /applyProfileSavePatchToDoc\(/, name);
      assert.doesNotMatch(fn, /setShellData\(\(prev\) => \(\{[^]*?\.\.\.patch,/, name);
      assert.doesNotMatch(fn, /\{\s*\.\.\.\(prev \?\? \{\}\),\s*\.\.\.patch/, name);
    }
  });

  it('faces are written with set(merge), which deep-merges the nested map', () => {
    // update() with a `profiles` map would replace the other face.
    const service = read('services/firestoreService.android.ts');
    assert.match(service, /async function upsertUserProfile[^]*?\.set\(\s*\{[^]*?\},\s*\{ merge: true \},?\s*\)/);
  });
});
