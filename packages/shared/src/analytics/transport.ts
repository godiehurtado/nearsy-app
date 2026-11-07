import type { AnalyticsValue } from './sanitize';

export type AnalyticsProps = Readonly<Record<string, AnalyticsValue>>;

/** The only surface the app uses from the analytics SDK. */
export type AnalyticsTransport = {
  capture(event: string, properties: AnalyticsProps): void;
  identify(uid: string, set: AnalyticsProps, setOnce: AnalyticsProps): void;
  setPersonProperties(set: AnalyticsProps, setOnce: AnalyticsProps): void;
  unsetPersonProperties(names: readonly string[]): void;
  reset(): void;
  /** Removes queued events of this identity and returns how many were removed. */
  discardQueuedEventsFor(distinctId: string): number;
  /** Distinct id if a person is identified, null while anonymous. */
  getIdentifiedId(): string | null;
  getSessionId(): string | null;
  flush(): Promise<void> | void;
};

export type AnalyticsTransportFactory = () => Promise<AnalyticsTransport | null>;

export type AnalyticsLogger = (
  code: string,
  details?: Readonly<Record<string, string | number | boolean>>,
) => void;

export const silentAnalyticsLogger: AnalyticsLogger = () => {};
