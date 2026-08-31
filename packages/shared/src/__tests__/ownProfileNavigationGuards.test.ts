import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideDirtyNavigationGuard } from '../profile/ownProfileEditorState';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('Own Profile navigation and source guards', () => {
  it('does not infer new profile from realName', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(src, /isNewProfile/);
    assert.doesNotMatch(src, /existingRealName/);
    assert.match(src, /classifyOwnProfileLoadResult/);
    assert.match(src, /lifecycleAuth/);
    const helper = readShared('profile/ownProfileEditorState.ts');
    assert.match(helper, /isProfileDocumentComplete/);
  });

  it('does not replace MainTabs or write profileSetupCompleted on Own Profile save', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(src, /replace\(\s*['"]MainTabs['"]\s*\)/);
    assert.doesNotMatch(src, /profileSetupCompleted:\s*true/);
    assert.match(src, /buildOwnProfileSavePatch/);
    assert.match(src, /updateUserProfilePartial\(uid, modePatch\)/);
  });

  it('incomplete users are gated to ProfileCompletion, not Own Profile', () => {
    const nav = readShared('navigation/AppNavigator.tsx');
    assert.match(nav, /isProfileDocumentComplete/);
    assert.match(nav, /setNeedsCompleteProfile\(!isProfileDocumentComplete/);
    assert.match(
      nav,
      /if \(needsCompleteProfile\)[\s\S]*?name="ProfileCompletion"/,
    );
    const ownProfile = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(ownProfile, /name: 'ProfileCompletion'/);
    assert.match(ownProfile, /redirectIncompleteToCrj/);
    assert.match(ownProfile, /setLifecycleAuth\('blocked'\)/);
  });

  it('load error fails closed without incomplete redirect', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /setLifecycleAuth\('error'\)/);
    const errorCatch = src.slice(
      src.indexOf("setLifecycleAuth('error')") - 80,
      src.indexOf("setLifecycleAuth('error')") + 80,
    );
    assert.doesNotMatch(errorCatch, /redirectIncompleteToCrj/);
  });

  it('save is gated on lifecycle authorization, not unresolved profileDoc null', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    const persist = src.slice(
      src.indexOf('const persistOwnProfile'),
      src.indexOf('const handleSave'),
    );
    assert.match(persist, /isOwnProfileSaveAuthorized\(lifecycleAuth\)/);
    assert.doesNotMatch(persist, /isOwnProfileEditorAllowed\(profileDoc\)/);
  });

  it('beforeRemove Continue Editing preserves dirty; Discard bypasses once then redispatches', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /decideDirtyNavigationGuard/);
    assert.match(src, /bypassDirtyNavigationRef/);
    assert.match(src, /beforeRemove/);
    assert.match(src, /navigation\.dispatch\(e\.data\.action/);
    assert.match(src, /isDirtyRef\.current = false/);
    assert.match(src, /return unsubscribe/);
  });

  it('discard bypass is true during redispatch and resets asynchronously without queueMicrotask', async () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    const discardBlock = src.slice(
      src.indexOf('confirmDiscardChanges(() => {'),
      src.indexOf('return unsubscribe'),
    );
    assert.doesNotMatch(discardBlock, /queueMicrotask/);
    assert.match(
      discardBlock,
      /bypassDirtyNavigationRef\.current = true[\s\S]*navigation\.dispatch\(e\.data\.action[\s\S]*setTimeout\(\(\) => \{[\s\S]*bypassDirtyNavigationRef\.current = false/,
    );

    let bypass = false;
    let isDirty = true;

    assert.equal(decideDirtyNavigationGuard({ isDirty, bypass }), 'prompt');

    bypass = true;
    isDirty = false;
    assert.equal(decideDirtyNavigationGuard({ isDirty, bypass }), 'allow');

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        bypass = false;
        resolve();
      }, 0);
    });

    isDirty = true;
    assert.equal(decideDirtyNavigationGuard({ isDirty, bypass }), 'prompt');
  });

  it('dirty mode switch confirms before callable; Continue Editing skips backend', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    const toggle = src.slice(
      src.indexOf('const handleToggleMode = '),
      src.indexOf('const validationMessage'),
    );
    assert.match(toggle, /isDirtyRef\.current/);
    assert.match(toggle, /confirmDiscardChanges/);
    assert.match(toggle, /void runModeSwitch\(\)/);
    // Callable lives only inside runModeSwitch, not before confirm.
    assert.doesNotMatch(toggle, /switchMode/);
    assert.match(src, /modeSwitchSessionRef\.current\.switchMode/);
    assert.doesNotMatch(src, /updateUserMode/);
    assert.doesNotMatch(src, /includeModeInPatch:\s*true/);
  });

  it('mode switch still uses the callable session, not users.mode writes', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(src, /createActiveProfileModeSwitchSession/);
    assert.match(src, /modeSwitchSessionRef\.current\.switchMode/);
    assert.doesNotMatch(src, /updateUserMode/);
    assert.doesNotMatch(src, /includeModeInPatch:\s*true/);
  });

  it('Status is absent from Own Profile UI and save input', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(src, /setStatus/);
    assert.doesNotMatch(src, /status-input/);
    assert.doesNotMatch(src, /setActiveField\('status'\)/);
    assert.doesNotMatch(src, /STATUS_MAX/);
    assert.match(src, /lastName/);
    assert.match(src, /setLastName/);
  });

  it('Own Profile save does not upload or write topBar fields', () => {
    const src = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(src, /uploadTopBarImage/);
    const persist = src.slice(
      src.indexOf('const persistOwnProfile'),
      src.indexOf('const handleSave'),
    );
    assert.doesNotMatch(persist, /topBar/);
    assert.doesNotMatch(persist, /profileSetupCompleted/);
    assert.match(persist, /buildPersistedOwnProfileDraftAfterUpload/);
    assert.match(src, /confirmDiscardChanges/);
  });

  it('Android PhoneVerification still targets CompleteProfile token; no Android file edited', () => {
    const android = readShared('screens/PhoneVerificationScreen.android.tsx');
    assert.match(android, /name: complete \? 'MainTabs' : 'CompleteProfile'/);
    assert.match(android, /name: 'CompleteProfile'/);
    // Shared Own Profile Case C redirects incomplete → ProfileCompletion when available.
    const own = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(own, /redirect_incomplete|redirectIncompleteToCrj/);
  });
});
