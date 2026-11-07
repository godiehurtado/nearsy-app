/**
 * Runs the real posthog-react-native class under Node, with `react-native`
 * stubbed and the network path intercepted. This proves SDK behaviour, not
 * device behaviour.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { INTERCEPT_HOST, INTERCEPT_TOKEN } from '../analyticsConfig.ts';
import { createAnalyticsSession } from '../analyticsCore.ts';
import {
  createSdkTransport,
  type InterceptedRequest,
} from '../analyticsSdkTransport.ts';
import { loadRealPostHog, restoreGlobals } from './realSdkHarness.ts';

const originalFetch = globalThis.fetch;
let networkCalls = 0;
let PostHog: unknown;

before(() => {
  PostHog = loadRealPostHog();
  globalThis.fetch = (async () => {
    networkCalls += 1;
    throw new Error('network must not be reached');
  }) as typeof fetch;
});

after(() => {
  restoreGlobals();
  globalThis.fetch = originalFetch;
});

async function makeTransport() {
  const requests: InterceptedRequest[] = [];
  const transport = await createSdkTransport({
    PostHog,
    token: INTERCEPT_TOKEN,
    host: INTERCEPT_HOST,
    persistence: 'memory',
    onInterceptedRequest: (request) => requests.push(request),
  });
  const sent = async () => {
    await transport.flush();
    return requests.flatMap((request) => request.events);
  };
  return { requests, sent, transport };
}

describe('real SDK with intercepted requests', () => {
  it('loads the published SDK class', () => {
    assert.equal(typeof PostHog, 'function');
  });

  it('answers the startup config with a simulated body, and nothing reaches the network', async () => {
    const { requests } = await makeTransport();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(
      requests.map((request) => request.path),
      [`/array/${INTERCEPT_TOKEN}/config`],
    );
    assert.equal(networkCalls, 0);
  });

  it('sends identify then the event through the batch path, without network', async () => {
    const { requests, sent, transport } = await makeTransport();
    await transport.identify('uid-a', { email: 'a@example.test' });
    await transport.capture('signup_completed', {});
    const events = await sent();
    const names = events.map((item) => item.event);
    assert.deepEqual(names, ['$identify', 'signup_completed']);
    assert.ok(requests.some((request) => request.path === '/batch/'));
    assert.equal(networkCalls, 0);
    assert.equal(transport.getIdentifiedDistinctId(), 'uid-a');
  });

  it('applies before_send: an event outside the contract is dropped', async () => {
    const { sent, transport } = await makeTransport();
    await transport.capture('app_opened', {});
    await (transport.capture as (event: string) => void)('$screen');
    await (transport.capture as (event: string) => void)('Application Opened');
    const names = (await sent()).map((item) => item.event);
    assert.deepEqual(names, ['app_opened']);
  });

  it('drops custom properties the contract does not list, keeping registered ones', async () => {
    const { sent, transport } = await makeTransport();
    await transport.register({ platform: 'Android', environment: 'sdk_intercept' });
    await transport.capture('app_opened', {
      session_id: 'kept',
      peer_uid: 'must-not-leave',
    });
    const [event] = await sent();
    assert.ok(event.propertyKeys.includes('session_id'));
    assert.ok(event.propertyKeys.includes('platform'));
    assert.ok(!event.propertyKeys.includes('peer_uid'));
  });

  it('reset clears the identified person and the registered properties', async () => {
    const { sent, transport } = await makeTransport();
    await transport.identify('uid-a', {});
    await transport.register({ platform: 'Android' });
    await transport.reset();
    assert.equal(transport.getIdentifiedDistinctId(), null);
    await transport.capture('app_opened', {});
    const events = await sent();
    const opened = events.find((item) => item.event === 'app_opened');
    assert.ok(opened);
    assert.ok(!opened.propertyKeys.includes('platform'));
  });

  it('exposes a session id that stays stable while the app is in use', async () => {
    const { transport } = await makeTransport();
    const first = transport.getSessionId();
    assert.equal(typeof first, 'string');
    assert.equal(transport.getSessionId(), first);
  });

  it('person updates carry set and set_once keys', async () => {
    const { sent, transport } = await makeTransport();
    await transport.identify('uid-a', {});
    await transport.setPersonProperties(
      { occupation: 'x' },
      { signup_source: 'campaign' },
    );
    const events = await sent();
    const update = events.find((item) => item.event === '$set');
    assert.ok(update);
    assert.deepEqual(update.personKeys.sort(), ['occupation', 'signup_source']);
  });

  it('works under the real session: A to B never mixes people', async () => {
    const { sent, transport } = await makeTransport();
    const auth = { user: { uid: 'A' } as { uid: string } | null };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => auth.user,
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({ platform: 'Android' }),
      buildProfileProperties: () => null,
      superProperties: { platform: 'Android' },
      now: () => 0,
    });
    session.trackSignupCompleted('A');
    await session.settled();
    auth.user = { uid: 'B' };
    session.noteAuthChange();
    session.trackProfileCompleted('B');
    await session.settled();
    assert.equal(transport.getIdentifiedDistinctId(), 'B');
    const names = (await sent()).map((item) => item.event);
    assert.deepEqual(names, [
      '$identify',
      'signup_completed',
      '$identify',
      'profile_completed',
    ]);
    assert.equal(networkCalls, 0);
  });
});
