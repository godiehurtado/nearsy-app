/**
 * QA 2.1.0 blocker 1: per-mode face contract C1–C4 (agreed with Functions and
 * Android). Controlled scenarios on an in-memory model of Firestore set-merge,
 * with clearly different Personal and Professional data. No real accounts.
 *
 * Model: setDoc(merge) stores dotted keys LITERALLY (never as paths), merges
 * nested maps leaf by leaf, and removes a field given the delete sentinel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildOwnProfileSavePatch, type OwnProfileDraft } from '../profile/ownProfileEditorState';
import {
  applyFaceSaveToDoc,
  buildActiveProfileSavePatch,
  literalFaceKey,
  resolveModePresentation,
  splitFacePatch,
} from '../profile/profileModeFields';
import { buildUserProfileSetPayload } from '../profile/userProfileSetPayload';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

const DELETE = Symbol('deleteField');
type Doc = Record<string, unknown>;

function isMap(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && v !== DELETE;
}

/** Firestore set(..., {merge:true}) semantics for the keys we use. */
function setMerge(doc: Doc, payload: Doc): Doc {
  const out: Doc = { ...doc };
  for (const [key, value] of Object.entries(payload)) {
    if (value === DELETE) delete out[key];
    else if (isMap(value)) out[key] = setMerge(isMap(out[key]) ? (out[key] as Doc) : {}, value);
    else out[key] = value;
  }
  return out;
}

/** 2.1.0 client write (C1/C2). */
const newClientWrite = (doc: Doc, patch: Doc) => setMerge(doc, buildUserProfileSetPayload(patch, () => DELETE));
/** Public 2.0.x client write: dotted keys land as literal names. */
const oldClientWrite = (doc: Doc, patch: Doc) => setMerge(doc, patch);

const IMG_P = 'https://cdn.example/personal.jpg';
const IMG_PRO = 'https://cdn.example/pro.jpg';

function draft(face: 'personal' | 'professional'): OwnProfileDraft {
  const p = face === 'personal';
  return {
    realName: p ? 'Ana' : 'Ana María',
    lastName: p ? 'Pérez' : 'Pérez Gil',
    profileImage: p ? IMG_P : IMG_PRO,
    occupation: p ? 'Runner' : 'Engineer',
    bio: p ? 'Personal bio' : 'Professional bio',
    company: p ? '' : 'Acme',
    birthCountryCode: null,
    currentCity: null,
    languageCodes: [],
    professionalIndustryId: null,
  };
}

const savePatch = (face: 'personal' | 'professional', active: boolean) =>
  buildOwnProfileSavePatch({ mode: face, draft: draft(face), projectActiveToTopLevel: active });

/** Affected-account shape: no nested map, Personal only in literals + top level. */
function legacyLiteralDoc(): Doc {
  return oldClientWrite(
    { mode: 'personal' },
    buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: { ...draft('personal'), company: undefined },
      projectActiveToTopLevel: true,
      includeModeInPatch: false,
    }),
  );
}

const face = (doc: Doc, mode: 'personal' | 'professional') => resolveModePresentation(doc, mode);
const literalKeys = (doc: Doc) => Object.keys(doc).filter((k) => k.startsWith('profiles.'));

describe('C1/C2 write', () => {
  it('face keys become a nested map and the written literals are deleted; the other mode is untouched', () => {
    const payload = buildUserProfileSetPayload(savePatch('professional', false), () => DELETE);
    assert.deepEqual(Object.keys(payload.profiles as Doc), ['professional']);
    assert.equal(((payload.profiles as Doc).professional as Doc).company, 'Acme');
    for (const key of Object.keys(payload).filter((k) => k.startsWith('profiles.'))) {
      assert.equal(payload[key], DELETE, key);
      assert.match(key, /^profiles\.professional\./);
    }
    assert.equal('realName' in payload, false, 'inactive face never projects to top level');
  });

  it('blank or absent fields write nothing and delete nothing', () => {
    const split = splitFacePatch(
      buildActiveProfileSavePatch({
        mode: 'professional',
        presentation: { realName: 'Ana María', bio: '   ', company: undefined },
        projectActiveToTopLevel: false,
        includeModeInPatch: false,
      }),
    );
    assert.deepEqual(split.faces, { professional: { realName: 'Ana María' } });
    assert.deepEqual(split.literalKeysToDelete, ['profiles.professional.realName']);
  });

  it('a nested profiles object already in the patch (account shell) is merged, not replaced', () => {
    const payload = buildUserProfileSetPayload(
      { profiles: { personal: { realName: '' } }, 'profiles.professional.company': 'Acme' },
      () => DELETE,
    );
    assert.deepEqual(payload.profiles, { personal: { realName: '' }, professional: { company: 'Acme' } });
  });
});

describe('QA sequence on controlled data (affected-account shape)', () => {
  it('save Professional (inactive) → relogin → both faces intact', () => {
    let doc = legacyLiteralDoc();
    assert.equal(doc.profiles, undefined);
    assert.equal(face(doc, 'personal').realName, 'Ana');
    assert.equal(face(doc, 'professional').realName, '', 'inactive face never borrows top level');

    doc = newClientWrite(doc, savePatch('professional', false));
    // "Relogin" = read the stored doc again.
    assert.equal(face(doc, 'professional').company, 'Acme');
    assert.equal(face(doc, 'professional').realName, 'Ana María');
    assert.equal(face(doc, 'personal').realName, 'Ana');
    assert.equal(face(doc, 'personal').profileImage, IMG_P);
    assert.equal(doc.realName, 'Ana', 'top-level mirror still Personal (active)');
    assert.deepEqual(literalKeys(doc).filter((k) => k.includes('.professional.')), []);
  });

  it('switch to Professional, edit Personal, switch back: faces never mix', () => {
    let doc = newClientWrite(legacyLiteralDoc(), savePatch('professional', false));
    doc = setMerge(doc, { mode: 'professional' }); // setActiveProfileMode writes only mode
    assert.equal(face(doc, 'professional').occupation, 'Engineer');
    assert.equal(face(doc, 'personal').occupation, 'Runner');

    doc = newClientWrite(doc, savePatch('personal', false)); // Personal edited while inactive
    assert.equal(face(doc, 'personal').bio, 'Personal bio');
    assert.equal(face(doc, 'professional').bio, 'Professional bio');

    doc = setMerge(doc, { mode: 'personal' });
    doc = newClientWrite(doc, savePatch('personal', true));
    assert.equal(face(doc, 'personal').realName, 'Ana');
    assert.equal(face(doc, 'professional').realName, 'Ana María');
    assert.deepEqual(literalKeys(doc), []);
  });

  it('a public 2.0.x write after a 2.1.0 save wins (literal first)', () => {
    let doc = newClientWrite(legacyLiteralDoc(), savePatch('professional', false));
    doc = oldClientWrite(doc, { [literalFaceKey('professional', 'company')]: 'NewCo' });
    assert.equal(face(doc, 'professional').company, 'NewCo');
    assert.equal(face(doc, 'professional').realName, 'Ana María');
  });

  it('the local copy after a save matches the stored doc', () => {
    const before = legacyLiteralDoc();
    const patch = savePatch('professional', false);
    const local = applyFaceSaveToDoc(before, patch);
    const stored = newClientWrite(before, patch);
    for (const mode of ['personal', 'professional'] as const) {
      assert.deepEqual(face(local, mode), face(stored, mode), mode);
    }
    assert.deepEqual(literalKeys(local), literalKeys(stored));
  });

  it('pure legacy doc (top level only): only the active face reads it', () => {
    const doc: Doc = { mode: 'personal', realName: 'Ana', bio: 'Personal bio' };
    assert.equal(face(doc, 'personal').realName, 'Ana');
    assert.equal(face(doc, 'professional').realName, '');
  });
});

describe('wiring', () => {
  it('every users/{uid} profile write goes through the C1/C2 payload', () => {
    const service = read('services/firestoreService.ts');
    assert.match(service, /buildUserProfileSetPayload\(patch, deleteField\)/);
    const edit = read('screens/CompleteProfileScreen.tsx');
    assert.match(edit, /applyFaceSaveToDoc\(profileDoc, modePatch\)/);
    assert.match(edit, /projectActiveToTopLevel: mode === \(confirmedMode \?\? mode\)/);
    const crj = read('screens/ProfileCompletionScreen.tsx');
    assert.doesNotMatch(crj, /\.\.\.\(prev \?\? \{\}\),\s*\.\.\.patch,\s*\.\.\.contextPatch/);
  });
});
