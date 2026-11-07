/**
 * Marks flows of the app itself that leave it for a moment: sign-in activities,
 * permission dialogs, pickers, Settings. The app-open tracker uses this so they
 * do not count as a new open, and location requests also report their result.
 *
 * Deliberately free of imports: services used near the background location task
 * can use it without loading analytics, and it does nothing until analytics
 * starts. The wrapped call runs synchronously and keeps its result or rejection.
 */
export type LocationPermissionKind = 'foreground' | 'background';

type OwnFlowListener = () => () => void;
type LocationRequestListener = (
  kind: LocationPermissionKind,
  granted: boolean,
) => void;

let ownFlowListener: OwnFlowListener | null = null;
let locationRequestListener: LocationRequestListener | null = null;

export function setOwnExternalFlowListener(next: OwnFlowListener | null): void {
  ownFlowListener = next;
}

export function setLocationRequestListener(next: LocationRequestListener | null): void {
  locationRequestListener = next;
}

export async function withOwnExternalFlow<T>(run: () => T | Promise<T>): Promise<T> {
  let end: (() => void) | null = null;
  try {
    end = ownFlowListener?.() ?? null;
  } catch {
    end = null;
  }
  try {
    return await run();
  } finally {
    try {
      end?.();
    } catch {
      // Analytics must never interrupt the product flow.
    }
  }
}

export async function withLocationPermissionRequest<T>(
  kind: LocationPermissionKind,
  run: () => T | Promise<T>,
): Promise<T> {
  const result = await withOwnExternalFlow(run);
  try {
    const status = (result as { status?: unknown } | null | undefined)?.status;
    if (typeof status === 'string') {
      locationRequestListener?.(kind, status === 'granted');
    }
  } catch {
    // Analytics must never interrupt the product flow.
  }
  return result;
}
