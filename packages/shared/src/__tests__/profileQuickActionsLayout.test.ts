import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PROFILE_QUICK_ACTIONS_TWO_COLUMN_MIN_WIDTH,
  shouldUseSingleColumnQuickActions,
} from '../components/profile/profileQuickActionsLayout';

describe('Profile quick actions responsive layout', () => {
  it('uses a single column on standard phone widths', () => {
    assert.equal(shouldUseSingleColumnQuickActions(390, 1), true);
    assert.equal(
      shouldUseSingleColumnQuickActions(
        PROFILE_QUICK_ACTIONS_TWO_COLUMN_MIN_WIDTH - 1,
        1,
      ),
      true,
    );
  });

  it('allows two columns only on wider layouts with normal Dynamic Type', () => {
    assert.equal(
      shouldUseSingleColumnQuickActions(
        PROFILE_QUICK_ACTIONS_TWO_COLUMN_MIN_WIDTH,
        1,
      ),
      false,
    );
    assert.equal(shouldUseSingleColumnQuickActions(768, 1), false);
  });

  it('prefers one column at large Dynamic Type even on wide screens', () => {
    assert.equal(shouldUseSingleColumnQuickActions(768, 1.2), true);
    assert.equal(shouldUseSingleColumnQuickActions(390, 1.35), true);
  });
});
