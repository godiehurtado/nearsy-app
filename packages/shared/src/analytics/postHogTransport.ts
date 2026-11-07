import type { AnalyticsConfig } from './config';
import type { AnalyticsLogger, AnalyticsTransport } from './transport';

/** Non-iOS platforms never load the SDK. */
export async function createPostHogTransport(
  _config: AnalyticsConfig,
  _logger: AnalyticsLogger,
): Promise<AnalyticsTransport | null> {
  return null;
}
