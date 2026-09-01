import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AlertItem } from '../hooks/useNearbyAlerts';
import {
  buildAlertRowMessage,
  formatAlertDistance,
  formatAlertRelativeTime,
  NOTIFICATION_AVATAR_SIZE,
} from '../screens/alertsPresentation';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === 'notifications.messages.interestNearby') {
    return `${options?.name} is near you and you share interests${options?.interests ?? ''}.`;
  }
  if (key === 'notifications.messages.interestsSuffix') {
    return ` (${options?.interests})`;
  }
  if (key === 'notifications.messages.nearbyOnly') {
    return `${options?.name} is near you.`;
  }
  if (key === 'notifications.time.minutes') {
    return `${options?.count}m`;
  }
  if (key === 'notifications.time.hours') {
    return `${options?.count}h`;
  }
  if (key === 'notifications.distance') {
    return `${options?.count} ft`;
  }
  return key;
};

const identityTranslateItem = (_nameKey: string, fallback: string) => fallback;

describe('Alerts presentation helpers', () => {
  it('formats relative minutes and hours', () => {
    const now = Date.now();
    assert.equal(formatAlertRelativeTime(now - 5 * 60_000, now, t), '5m');
    assert.equal(formatAlertRelativeTime(now - 90 * 60_000, now, t), '2h');
  });

  it('builds interest_nearby and contact_nearby copy without contact semantics', () => {
    const interestAlert: AlertItem = {
      id: 'a1',
      uid: 'u1',
      name: 'Alex',
      kind: 'interest_nearby',
      sharedInterests: ['music_genre_pop'],
      at: Date.now(),
    };
    const nearbyAlert: AlertItem = {
      id: 'a2',
      uid: 'u2',
      name: 'Sam',
      kind: 'contact_nearby',
      at: Date.now(),
    };

    assert.match(
      buildAlertRowMessage(interestAlert, t, identityTranslateItem),
      /Alex is near you and you share interests \(Pop\)\./,
    );
    assert.equal(
      buildAlertRowMessage(nearbyAlert, t, identityTranslateItem),
      'Sam is near you.',
    );
  });

  it('uses Claude-density avatar size (~38px)', () => {
    assert.equal(NOTIFICATION_AVATAR_SIZE, 38);
  });

  it('formats distance when present', () => {
    assert.equal(formatAlertDistance(200, t), '200 ft');
    assert.equal(formatAlertDistance(undefined, t), null);
  });
});

describe('AlertsScreen preservation contract', () => {
  it('uses useNearbyAlerts and preserves DiscoveryProfile navigation', () => {
    const screen = readShared('screens/AlertsScreen.tsx');
    assert.match(screen, /useNearbyAlerts/);
    assert.match(screen, /DiscoveryProfile/);
    assert.match(screen, /params: \{ uid \}/);
    assert.match(screen, /openDiscoveryProfile\(item\.uid\)/);
    assert.doesNotMatch(screen, /client\.discoverNearby/);
    assert.doesNotMatch(screen, /getDiscoveryProfile/);
    assert.doesNotMatch(screen, /users\/\$\{/);
  });

  it('does not add Connect/Message actions or push settings UI', () => {
    const screen = readShared('screens/AlertsScreen.tsx');
    assert.doesNotMatch(screen, /\bConnect\b/);
    assert.doesNotMatch(screen, /['"]Message['"]/);
    assert.doesNotMatch(screen, /settings-outline/);
    assert.doesNotMatch(screen, /Push Notifications/);
    assert.doesNotMatch(screen, /master toggle/i);
  });

  it('uses i18n and production theme tokens instead of legacy hardcoded copy/colors', () => {
    const screen = readShared('screens/AlertsScreen.tsx');
    assert.match(screen, /useTranslation/);
    assert.match(screen, /t\('notifications\./);
    assert.match(screen, /useAppTheme/);
    assert.match(screen, /palette\.background/);
    assert.match(screen, /palette\.primary/);
    assert.doesNotMatch(screen, /Alerts \(real-time\)/);
    assert.doesNotMatch(screen, /#1F2937/);
    assert.doesNotMatch(screen, /topBar/);
    assert.doesNotMatch(screen, /topColor/);
  });

  it('preserves push token registration side effect', () => {
    const screen = readShared('screens/AlertsScreen.tsx');
    assert.match(screen, /registerPushToken/);
  });

  it('does not import Matching or Vertex client logic', () => {
    const screen = readShared('screens/AlertsScreen.tsx');
    assert.doesNotMatch(screen, /Matching/);
    assert.doesNotMatch(screen, /Vertex/);
  });
});

describe('RootTabs badge semantics', () => {
  it('keeps nearby count badge without unread semantics', () => {
    const rootTabs = readShared('navigation/RootTabs.tsx');
    assert.match(rootTabs, /useNearbyAlerts/);
    assert.match(rootTabs, /alerts\.length/);
    assert.match(rootTabs, /tabBarBadge: alertsBadge/);
    assert.doesNotMatch(rootTabs, /unread/i);
  });
});

describe('useNearbyAlerts functional surface', () => {
  it('remains the discoverNearby data source with 30s refresh', () => {
    const hook = readShared('hooks/useNearbyAlerts.ts');
    assert.match(hook, /discoverNearby/);
    assert.match(hook, /AUTO_REFRESH_MS = 30 \* 1000/);
    assert.match(hook, /interest_nearby/);
    assert.match(hook, /contact_nearby/);
  });
});

describe('Notifications i18n resources', () => {
  it('avoids misleading contact relationship copy in kinds', () => {
    const en = readShared('i18n/resources/notifications.ts');
    assert.match(en, /Nearby person/);
    assert.doesNotMatch(en, /Contact nearby/);
  });
});
