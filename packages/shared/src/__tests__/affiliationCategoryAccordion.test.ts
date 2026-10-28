import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

describe('Affiliation category accordions (CRJ + post-CRJ)', () => {
  it('starts closed and toggles from the category header', () => {
    const accordion = readShared(
      'components/registration/AffiliationCategoryAccordionList.tsx',
    );
    assert.ok(accordion.includes('expandedId === categoryId'));
    assert.ok(accordion.includes("name={open ? 'chevron-up' : 'chevron-down'}"));
    assert.ok(accordion.includes('category.icon'));
    assert.ok(accordion.includes('addedCount'));
    assert.ok(accordion.includes('accessibilityState={{ expanded: open }}'));
    assert.ok(accordion.includes('onPress={() => toggle(categoryId)}'));
    assert.ok(accordion.includes('embeddedInAccordion'));
  });

  it('keeps selected rows in parent state so collapse does not drop values', () => {
    const accordion = readShared(
      'components/registration/AffiliationCategoryAccordionList.tsx',
    );
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const editor = readShared('screens/AffiliationsScreen.tsx');
    assert.ok(accordion.includes('selected={selected}'));
    assert.ok(accordion.includes('onChangeSelected={onChangeSelected}'));
    assert.ok(accordion.includes('{open ? ('));
    assert.ok(crj.includes('selectedAffiliations'));
    assert.ok(editor.includes('[expandedId, setExpandedId]'));
    assert.match(editor, /useState<OnboardingAffiliationCategoryId \| null>\(\s*null\)/);
  });

  it('post-CRJ editor hosts the accordion; CRJ restores per-category screens', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const editor = readShared('screens/AffiliationsScreen.tsx');
    const journey = readShared('onboarding/crjJourney.ts');
    assert.ok(!crj.includes('<AffiliationCategoryAccordionList'));
    assert.ok(crj.includes('<OnboardingAffiliationCategoryPanel'));
    assert.ok(editor.includes('<AffiliationCategoryAccordionList'));
    assert.ok(crj.includes("step.kind === 'affiliation'"));
    assert.ok(journey.includes('affiliationCategoryIndex'));
  });

  it('blocked save/continue opens the affected category on post-CRJ', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const editor = readShared('screens/AffiliationsScreen.tsx');
    assert.ok(!crj.includes('setExpandedAffiliationId(blockedCategory)'));
    assert.ok(editor.includes('setExpandedId(blockedCategory)'));
    assert.ok(crj.includes('hideJourneyFooter'));
    assert.ok(editor.includes('hideJourneyFooter'));
  });

  it('hides panel chrome when embedded so the header is the only title', () => {
    const panel = readShared(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.ok(panel.includes('embeddedInAccordion'));
    assert.ok(panel.includes('{embeddedInAccordion ? null : ('));
  });
});
