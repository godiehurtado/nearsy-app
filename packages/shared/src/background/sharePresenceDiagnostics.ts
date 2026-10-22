import { Platform, Share } from 'react-native';

import {
  formatPresenceDiagnosticsExport,
  isPresenceDiagnosticsExportEmpty,
  loadPresenceDiagnosticsExport,
  type LocBgPlatform,
} from './presenceDiagnostics';

export type SharePresenceDiagnosticsResult =
  | 'shared'
  | 'empty'
  | 'dismissed'
  | 'failed';

function platform(): LocBgPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * Diagnostic-build only. Opens the OS share sheet with the sanitized ring +
 * counts. No coordinates, tokens, or account identifiers.
 */
export async function sharePresenceDiagnostics(): Promise<SharePresenceDiagnosticsResult> {
  try {
    const payload = await loadPresenceDiagnosticsExport(platform());
    if (isPresenceDiagnosticsExportEmpty(payload)) return 'empty';
    const message = formatPresenceDiagnosticsExport(payload);
    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message }
        : { message, title: payload.kind },
    );
    if (result.action === Share.dismissedAction) return 'dismissed';
    return 'shared';
  } catch {
    return 'failed';
  }
}
