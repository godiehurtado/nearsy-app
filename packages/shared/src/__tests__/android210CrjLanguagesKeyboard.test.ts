/**
 * QA 2.1.0 item 4 (Ana, physical): in CRJ the keyboard covered Languages and
 * hid what was typed. The field now scrolls itself under the top of the
 * visible area while focused, with room for its results above the keyboard,
 * in CRJ and in Own Profile edit. CRJ labels follow the form style (caps).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { registerHooks } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..');
const read = (rel: string) => readFileSync(path.join(src, rel), 'utf8');

// keyboardReveal imports react-native only for the hook; stub it for the pure functions.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native' || specifier === 'react') {
      return { url: `data:text/javascript,export const Keyboard={};export const Platform={};export const useEffect=()=>{};export const useState=(v)=>[v,()=>{}];`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const reveal = await import('../components/profileContext/keyboardReveal.ts');

describe('keyboard reveal math', () => {
  it('puts the field just under the top of the visible area, never above 0', () => {
    assert.equal(reveal.revealScrollY(500), 500 - reveal.REVEAL_TOP_MARGIN);
    assert.equal(reveal.revealScrollY(10), 0);
    assert.equal(reveal.revealScrollY(Number.NaN), 0);
  });

  it('adds bottom room only while the keyboard is open', () => {
    assert.equal(reveal.keyboardRevealPadding(0), 0);
    assert.equal(reveal.keyboardRevealPadding(-5), 0);
    assert.equal(reveal.keyboardRevealPadding(300), 300 + reveal.RESULTS_MAX_HEIGHT);
  });

  it('a small screen keeps the field and its results between the top and the keyboard', () => {
    // 640 dp window, 300 dp keyboard: field (48) + results (220) + margin fit in 340.
    const visible = 640 - 300;
    assert.ok(reveal.REVEAL_TOP_MARGIN + 48 + reveal.RESULTS_MAX_HEIGHT <= visible);
  });
});

describe('wiring', () => {
  const field = read('components/profileContext/LanguageMultiSelectField.tsx');
  const crj = read('screens/ProfileCompletionScreen.tsx');
  const edit = read('screens/CompleteProfileScreen.tsx');

  it('the field reveals itself once the keyboard is up and when results appear', () => {
    assert.match(field, /scrollRef\?: React\.RefObject<ScrollView \| null>/);
    assert.match(field, /ref=\{inputRef\}/);
    assert.match(field, /scroll\.scrollTo\(\{ y: revealScrollY\(y\), animated: true \}\)/);
    assert.match(field, /\[focused, keyboardHeight, showResults, revealInput\]/);
    assert.match(field, /maxHeight: RESULTS_MAX_HEIGHT/);
  });

  it('CRJ passes its step scroll view, adds keyboard room on details, caps the label', () => {
    assert.match(crj, /<LanguageMultiSelectField[^]*?uppercaseLabel[^]*?scrollRef=\{stepScrollRef\}/);
    assert.match(crj, /step\.kind === 'details' && keyboardHeight > 0[^]*?keyboardRevealPadding\(keyboardHeight\)/);
  });

  it('Own Profile edit passes its scroll view down to Languages and adds keyboard room', () => {
    assert.match(edit, /scrollRef=\{scrollRef\}/);
    assert.match(edit, /keyboardRevealPadding\(keyboardHeight\)/);
    assert.match(read('components/profile/OwnProfileDetails.tsx'), /scrollRef=\{scrollRef\}/);
    assert.match(read('components/profile/OwnProfileBackgroundCard.tsx'), /uppercaseLabel[^]*?scrollRef=\{scrollRef\}/);
  });

  it('CRJ details labels are caps through the shared field styles; values are not transformed', () => {
    assert.match(read('components/registration/FormInput.tsx'), /label: \{[^}]*textTransform: 'uppercase'/);
    assert.match(read('components/industry/IndustrySelectField.tsx'), /label: \{[^}]*textTransform: 'uppercase'/);
    // Only label styles uppercase; inputs, values and chips do not.
    assert.equal((field.match(/textTransform: 'uppercase'/g) ?? []).length, 1);
    assert.match(field, /labelCaps: \{[^}]*textTransform: 'uppercase'/);
  });
});
