import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function readLines(path: string): number {
  return readFileSync(join(here, '..', path), 'utf8').split(/\r?\n/).length;
}

describe('Own Profile shell structure', () => {
  it('CompleteProfileScreen is decomposed into presentation components', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /OwnProfileHero/);
    assert.match(screen, /OwnProfileDetails/);
    assert.match(screen, /OwnProfileSaveBar/);
    assert.match(screen, /ProfileQuickActions/);
    assert.doesNotMatch(screen, /TopHeader/);
    assert.doesNotMatch(screen, /ColorPickerModal/);
  });

  it('legacy Own Profile UI is removed', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.doesNotMatch(screen, /COMPLETE_PROFILE_GUIDE/);
    assert.doesNotMatch(screen, /expo-av/);
    assert.doesNotMatch(screen, /Audio\./);
    assert.doesNotMatch(screen, /setStatus/);
    assert.doesNotMatch(screen, /topBarColor/);
    assert.doesNotMatch(screen, /topBarImage/);
    assert.doesNotMatch(screen, /topBarMode/);
    assert.doesNotMatch(screen, /uploadTopBarImage/);
    assert.doesNotMatch(screen, /isNewProfile/);
    assert.doesNotMatch(screen, /profileGuideVisible/);
    assert.doesNotMatch(screen, /Compatibility/);
    assert.doesNotMatch(screen, /Profile Preview/);
  });

  it('screen uses theme tokens instead of hardcoded root colors', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /useAppTheme/);
    assert.match(screen, /palette\.background/);
    assert.match(screen, /palette\.textPrimary/);
    assert.match(screen, /palette\.primary/);
  });

  it('localized My Profile title and no back button from tab entry', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /profile\.myProfileTitle/);
    assert.doesNotMatch(screen, /navigation\.goBack/);
  });

  it('presentation components use theme and accessibility props', () => {
    const hero = readShared('components/profile/OwnProfileHero.tsx');
    const details = readShared('components/profile/OwnProfileDetails.tsx');
    const saveBar = readShared('components/profile/OwnProfileSaveBar.tsx');
    const quick = readShared('components/ProfileQuickActions.tsx');
    const modeSwitch = readShared('components/ModeSwitch.tsx');

    for (const src of [hero, details, saveBar, quick, modeSwitch]) {
      assert.match(src, /useAppTheme/);
      assert.match(src, /palette\./);
    }

    assert.match(hero, /accessibilityRole="button"/);
    assert.match(hero, /accessibilityLabel=\{changePhotoA11y\}/);
    assert.match(modeSwitch, /accessibilityRole="tab"/);
    assert.match(modeSwitch, /accessibilityState/);
    assert.match(quick, /accessibilityRole="button"/);
    assert.match(saveBar, /accessibilityRole="button"/);
  });

  it('Company field is conditional to Professional in details', () => {
    const details = readShared('components/profile/OwnProfileDetails.tsx');
    assert.match(details, /mode === 'professional'/);
    assert.match(details, /lastName/);
    assert.doesNotMatch(details, /status/i);
  });

  it('four quick actions are wired with existing navigation handlers', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /goToProfileExtraScreen\('Interests'\)/);
    assert.match(screen, /goToAffiliations/);
    assert.match(screen, /goToSocialMedia/);
    assert.match(screen, /goToGallery/);
    const quick = readShared('components/ProfileQuickActions.tsx');
    assert.match(quick, /interests/);
    assert.match(quick, /affiliations/);
    assert.match(quick, /social/);
    assert.match(quick, /gallery/);
  });

  it('Unit 2 lifecycle and save contracts remain in orchestrator', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /classifyOwnProfileLoadResult/);
    assert.match(screen, /lifecycleAuth/);
    assert.match(screen, /buildOwnProfileSavePatch/);
    assert.match(screen, /decideDirtyNavigationGuard/);
    assert.match(screen, /createActiveProfileModeSwitchSession/);
    assert.doesNotMatch(screen, /profileSetupCompleted:\s*true/);
    assert.doesNotMatch(screen, /replace\(\s*['"]MainTabs['"]\s*\)/);
    assert.doesNotMatch(screen, /updateUserMode/);
  });

  it('new presentation files avoid hardcoded user-facing English', () => {
    const paths = [
      'components/profile/OwnProfileHero.tsx',
      'components/profile/OwnProfileDetails.tsx',
      'components/profile/OwnProfileSaveBar.tsx',
      'components/ProfileQuickActions.tsx',
      'components/ModeSwitch.tsx',
    ];
    for (const path of paths) {
      const src = readShared(path);
      assert.doesNotMatch(src, /Save changes/);
      assert.doesNotMatch(src, /Quick actions/);
      assert.doesNotMatch(src, /Professional/);
      assert.doesNotMatch(src, /Personal/);
      assert.doesNotMatch(src, /Affiliations/);
    }
  });

  it('CompleteProfileScreen LOC reduced materially from monolith', () => {
    const lines = readLines('screens/CompleteProfileScreen.tsx');
    assert.ok(lines < 1200, `expected orchestrator < 1200 lines, got ${lines}`);
    assert.ok(lines > 400, `expected non-trivial orchestrator, got ${lines}`);
  });

  it('Own Profile keeps scroll content behind an opaque top safe-area overlay', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /useSafeAreaInsets/);
    assert.match(screen, /statusBarOverlay/);
    assert.match(screen, /height:\s*insets\.top/);
    assert.match(screen, /pointerEvents="none"/);
    assert.match(screen, /paddingTop:\s*insets\.top \+ spacing\.md/);
    assert.match(screen, /scrollIndicatorInsets=\{\{\s*top:\s*insets\.top\s*\}\}/);
    assert.doesNotMatch(screen, /paddingTop:\s*5[0-9]/);
    assert.doesNotMatch(screen, /SafeAreaView/);
  });

  it('Profile quick actions use responsive single-column layout without forced truncation', () => {
    const quick = readShared('components/ProfileQuickActions.tsx');
    assert.match(quick, /shouldUseSingleColumnQuickActions/);
    assert.match(quick, /useWindowDimensions/);
    assert.match(quick, /minWidth:\s*0/);
    assert.doesNotMatch(quick, /numberOfLines=/);
    assert.match(quick, /interests/);
    assert.match(quick, /affiliations/);
    assert.match(quick, /social/);
    assert.match(quick, /gallery/);
  });

  it('successful save dismisses the keyboard after persistence succeeds', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    const persist = screen.slice(
      screen.indexOf('const persistOwnProfile'),
      screen.indexOf('const handleSave'),
    );
    const successTail = persist.slice(persist.indexOf('commitSnapshot'));
    assert.match(successTail, /Keyboard\.dismiss\(\)/);
    assert.doesNotMatch(persist, /finally[\s\S]*Keyboard\.dismiss/);
    const catchBlock = persist.slice(persist.indexOf('} catch'));
    assert.doesNotMatch(catchBlock, /Keyboard\.dismiss/);
  });
});

describe('ModeSwitch segmented semantics', () => {
  it('exposes selected tab state and respects disabled/loading', () => {
    const src = readShared('components/ModeSwitch.tsx');
    assert.match(src, /accessibilityState=\{\{ selected, disabled: busy \}\}/);
    assert.match(src, /if \(selected \|\| busy\) return/);
    assert.match(src, /loadingOverlay/);
  });
});

describe('OwnProfileSaveBar behavior', () => {
  it('hides when not visible and supports disabled save state', () => {
    const src = readShared('components/profile/OwnProfileSaveBar.tsx');
    assert.match(src, /if \(!visible\) return null/);
    assert.match(src, /saveDisabled/);
    assert.match(src, /accessibilityState=\{\{ disabled: saveDisabled, busy: saving \}\}/);
  });
});
