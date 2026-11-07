/** Records every call so tests can assert exactly what would leave the app. */
import type { AnalyticsProps, AnalyticsTransport } from './transport';

export type FakeTransportCall =
  | {
      op: 'capture';
      event: string;
      properties: AnalyticsProps;
      distinctId: string | null;
    }
  | { op: 'identify'; uid: string; set: AnalyticsProps; setOnce: AnalyticsProps }
  | {
      op: 'setPerson';
      set: AnalyticsProps;
      setOnce: AnalyticsProps;
      distinctId: string | null;
    }
  | { op: 'unsetPerson'; names: readonly string[]; distinctId: string | null }
  | { op: 'reset' }
  | { op: 'discard'; distinctId: string }
  | { op: 'flush' };

export type FakeTransport = AnalyticsTransport & {
  calls: FakeTransportCall[];
  captured(event?: string): Extract<FakeTransportCall, { op: 'capture' }>[];
  throwOn: Set<FakeTransportCall['op']>;
  sessionId: string | null;
};

export function createFakeTransport(
  initialIdentifiedId: string | null = null,
): FakeTransport {
  let identified = initialIdentifiedId;
  const calls: FakeTransportCall[] = [];
  const throwOn = new Set<FakeTransportCall['op']>();
  const guard = (op: FakeTransportCall['op']) => {
    if (throwOn.has(op)) throw new Error(`fake ${op} failure`);
  };
  const fake: FakeTransport = {
    calls,
    throwOn,
    sessionId: 'session-1',
    captured(event) {
      return calls.filter(
        (c): c is Extract<FakeTransportCall, { op: 'capture' }> =>
          c.op === 'capture' && (!event || c.event === event),
      );
    },
    capture(event, properties) {
      guard('capture');
      calls.push({ op: 'capture', event, properties, distinctId: identified });
    },
    identify(uid, set, setOnce) {
      guard('identify');
      identified = uid;
      calls.push({ op: 'identify', uid, set, setOnce });
    },
    setPersonProperties(set, setOnce) {
      guard('setPerson');
      calls.push({ op: 'setPerson', set, setOnce, distinctId: identified });
    },
    unsetPersonProperties(names) {
      guard('unsetPerson');
      calls.push({ op: 'unsetPerson', names, distinctId: identified });
    },
    reset() {
      guard('reset');
      identified = null;
      calls.push({ op: 'reset' });
    },
    discardQueuedEventsFor(distinctId) {
      guard('discard');
      calls.push({ op: 'discard', distinctId });
      return 0;
    },
    getIdentifiedId: () => identified,
    getSessionId: () => fake.sessionId,
    flush() {
      guard('flush');
      calls.push({ op: 'flush' });
    },
  };
  return fake;
}
