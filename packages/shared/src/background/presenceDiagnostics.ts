/**
 * Background presence diagnostics for published 2.0.8 test builds.
 *
 * Records task start/stop, location-callback transitions, accuracy discards,
 * and publish outcomes. Does not change stop/retry/TTL/visibility behavior.
 *
 * Recovery: production `console` lines prefixed `[loc.bg]` (logcat / Console.app)
 * plus a local AsyncStorage ring dumped on resume. Not Crashlytics — no crash
 * required.
 *
 * Limitations (do not over-read):
 * - `started: true` is an Expo snapshot of hasStartedLocationUpdatesAsync; the
 *   OS may still have stopped FGS / CLLocation without JS observing it.
 * - Missing callback events is not proof of missing OS callbacks: repetitive
 *   success is suppressed, and iOS JS is frozen while suspended.
 */

export const LOC_BG_LOG_PREFIX = '[loc.bg]';
export const LOC_BG_RING_PREFIX = '[loc.bg.ring]';
export const LOC_BG_STORAGE_KEY = 'NEARSY_LOC_BG_DIAG_V1';
export const LOC_BG_RING_LIMIT = 40;
export const LOC_BG_SKIP_DEBOUNCE_MS = 60_000;
export const LOC_BG_EVIDENCE_WINDOW_MS = 15 * 60_000;
export const LOC_BG_EXPORT_KIND = 'loc.bg';
export const LOC_BG_BUILD_LABEL = '208-diag';

export type LocBgPlatform = 'ios' | 'android';
export type LocBgEvent =
  | 'start_ok'
  | 'start_blocked'
  | 'stop'
  | 'callback'
  | 'skip'
  | 'publish_ok'
  | 'publish_fail'
  | 'resume';

export type LocBgStopClass =
  | 'logout'
  | 'visibility_off'
  | 'bg_preference_off'
  | 'permission_revoked'
  | 'session_unconfirmed'
  | 'approximate'
  | 'headless_not_ready'
  | 'callable_auth'
  | 'callable_app_check'
  | 'callable_permission'
  | 'task_error'
  | 'other';

export type LocBgSkipClass =
  | 'empty_batch'
  | 'session_not_open'
  | 'session_stale'
  | 'invalid_accuracy'
  | 'callable_retryable'
  | 'runtime_gate';

export type LocBgStartBlockClass =
  | 'session_unconfirmed'
  | 'approximate'
  | 'visibility_off'
  | 'bg_preference_off'
  | 'permission'
  | 'logout'
  | 'other';

export type AccuracyBucket = 'le25' | 'le50' | 'le100' | 'gt100' | 'missing';
export type GapBucket = 'none' | 'le15s' | 'le60s' | 'le5m' | 'le15m' | 'gt15m';
export type AppStateBucket = 'active' | 'background' | 'unknown';

export type LocBgRecord = {
  t: number;
  e: LocBgEvent;
  plat: LocBgPlatform;
  stop?: LocBgStopClass;
  skip?: LocBgSkipClass;
  block?: LocBgStartBlockClass;
  acc?: AccuracyBucket;
  gap?: GapBucket;
  started?: boolean;
  app?: AppStateBucket;
};

export type LocBgCounts = {
  start_ok: number;
  start_blocked: number;
  stop: number;
  callback: number;
  skip: number;
  publish_ok: number;
  publish_fail: number;
  resume: number;
  skipBy: Record<string, number>;
  stopBy: Record<string, number>;
  blockBy: Record<string, number>;
};

export type LocBgExportPayload = {
  v: 1;
  kind: typeof LOC_BG_EXPORT_KIND;
  build: typeof LOC_BG_BUILD_LABEL;
  plat: LocBgPlatform;
  firstAt: number | null;
  lastAt: number | null;
  lastCallbackAt: number | null;
  lastPublishOkAt: number | null;
  spanMin: number;
  n: LocBgCounts;
  ring: LocBgRecord[];
};

export type LocBgInput = {
  event: LocBgEvent;
  platform: LocBgPlatform;
  stop?: LocBgStopClass;
  skip?: LocBgSkipClass;
  block?: LocBgStartBlockClass;
  accuracyMeters?: number | null;
  started?: boolean;
  appState?: AppStateBucket;
};

export type DiagStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type PersistedDiag = {
  firstAtMs: number | null;
  lastAtMs: number | null;
  lastCallbackAtMs: number | null;
  lastPublishOkAtMs: number | null;
  lastCallbackGap: GapBucket | null;
  lastPublishOkGap: GapBucket | null;
  lastSkipAt: Record<string, number>;
  lastBlockAt: Record<string, number>;
  counts: LocBgCounts;
  ring: LocBgRecord[];
};

type EmitDecision = {
  emit: boolean;
  gap: GapBucket;
  nextCallbackGap: GapBucket | null;
  nextPublishOkGap: GapBucket | null;
  nextCallbackAtMs: number | null;
  nextPublishOkAtMs: number | null;
};

function emptyCounts(): LocBgCounts {
  return {
    start_ok: 0,
    start_blocked: 0,
    stop: 0,
    callback: 0,
    skip: 0,
    publish_ok: 0,
    publish_fail: 0,
    resume: 0,
    skipBy: {},
    stopBy: {},
    blockBy: {},
  };
}

const EMPTY_STATE: PersistedDiag = {
  firstAtMs: null,
  lastAtMs: null,
  lastCallbackAtMs: null,
  lastPublishOkAtMs: null,
  lastCallbackGap: null,
  lastPublishOkGap: null,
  lastSkipAt: {},
  lastBlockAt: {},
  counts: emptyCounts(),
  ring: [],
};

let memory: PersistedDiag = {
  ...EMPTY_STATE,
  lastSkipAt: {},
  lastBlockAt: {},
  counts: emptyCounts(),
  ring: [],
};
let storage: DiagStorage | null = null;
let logImpl: (line: string) => void = (line) => {
  console.log(line);
};
let nowImpl: () => number = () => Date.now();

export function accuracyBucket(
  meters: number | null | undefined,
): AccuracyBucket {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return 'missing';
  if (meters <= 25) return 'le25';
  if (meters <= 50) return 'le50';
  if (meters <= 100) return 'le100';
  return 'gt100';
}

export function gapBucket(deltaMs: number | null | undefined): GapBucket {
  if (deltaMs == null || !Number.isFinite(deltaMs) || deltaMs < 0) return 'none';
  if (deltaMs <= 15_000) return 'le15s';
  if (deltaMs <= 60_000) return 'le60s';
  if (deltaMs <= 5 * 60_000) return 'le5m';
  if (deltaMs <= 15 * 60_000) return 'le15m';
  return 'gt15m';
}

export function formatLocBgLine(record: LocBgRecord): string {
  return `${LOC_BG_LOG_PREFIX} ${JSON.stringify(record)}`;
}

export function formatLocBgRingLine(ring: readonly LocBgRecord[]): string {
  return `${LOC_BG_RING_PREFIX} n=${ring.length} ${JSON.stringify(ring)}`;
}

function bumpCountMap(
  map: Record<string, number>,
  key: string | undefined,
): Record<string, number> {
  if (!key) return map;
  return { ...map, [key]: (map[key] ?? 0) + 1 };
}

export function bumpLocBgCounts(
  counts: LocBgCounts,
  input: LocBgInput,
): LocBgCounts {
  const next: LocBgCounts = {
    ...counts,
    skipBy: { ...counts.skipBy },
    stopBy: { ...counts.stopBy },
    blockBy: { ...counts.blockBy },
  };
  next[input.event] += 1;
  if (input.event === 'skip') next.skipBy = bumpCountMap(next.skipBy, input.skip);
  if (input.event === 'stop') next.stopBy = bumpCountMap(next.stopBy, input.stop);
  if (input.event === 'start_blocked') {
    next.blockBy = bumpCountMap(next.blockBy, input.block);
  }
  return next;
}

function parseCountMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  return out;
}

function parseCounts(raw: unknown): LocBgCounts {
  const base = emptyCounts();
  if (!raw || typeof raw !== 'object') return base;
  const src = raw as Partial<LocBgCounts>;
  for (const key of [
    'start_ok',
    'start_blocked',
    'stop',
    'callback',
    'skip',
    'publish_ok',
    'publish_fail',
    'resume',
  ] as const) {
    const value = src[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      base[key] = value;
    }
  }
  base.skipBy = parseCountMap(src.skipBy);
  base.stopBy = parseCountMap(src.stopBy);
  base.blockBy = parseCountMap(src.blockBy);
  return base;
}

export function sanitizeLocBgRecord(record: LocBgRecord): LocBgRecord {
  const out: LocBgRecord = {
    t: record.t,
    e: record.e,
    plat: record.plat,
  };
  if (record.stop) out.stop = record.stop;
  if (record.skip) out.skip = record.skip;
  if (record.block) out.block = record.block;
  if (record.acc) out.acc = record.acc;
  if (record.gap) out.gap = record.gap;
  if (typeof record.started === 'boolean') out.started = record.started;
  if (record.app) out.app = record.app;
  return out;
}

export function decideLocBgEmit(
  state: PersistedDiag,
  input: LocBgInput,
  nowMs: number,
): EmitDecision {
  const prevAt =
    input.event === 'publish_ok' || input.event === 'resume'
      ? state.lastCallbackAtMs
      : input.event === 'callback'
        ? state.lastCallbackAtMs
        : state.lastCallbackAtMs;
  const gap = gapBucket(prevAt == null ? null : nowMs - prevAt);

  if (
    input.event === 'start_ok' ||
    input.event === 'stop' ||
    input.event === 'resume' ||
    input.event === 'publish_fail'
  ) {
    return {
      emit: true,
      gap,
      nextCallbackGap: state.lastCallbackGap,
      nextPublishOkGap: state.lastPublishOkGap,
      nextCallbackAtMs: state.lastCallbackAtMs,
      nextPublishOkAtMs: state.lastPublishOkAtMs,
    };
  }

  if (input.event === 'callback') {
    const emit = state.lastCallbackGap !== gap;
    return {
      emit,
      gap,
      nextCallbackGap: emit ? gap : state.lastCallbackGap,
      nextPublishOkGap: state.lastPublishOkGap,
      nextCallbackAtMs: nowMs,
      nextPublishOkAtMs: state.lastPublishOkAtMs,
    };
  }

  if (input.event === 'publish_ok') {
    const emit = state.lastPublishOkGap !== gap;
    return {
      emit,
      gap,
      nextCallbackGap: state.lastCallbackGap,
      nextPublishOkGap: emit ? gap : state.lastPublishOkGap,
      nextCallbackAtMs: state.lastCallbackAtMs,
      nextPublishOkAtMs: nowMs,
    };
  }

  if (input.event === 'start_blocked') {
    const blockKey = input.block ?? 'block';
    const last = state.lastBlockAt?.[blockKey];
    const emit =
      last == null || nowMs - last >= LOC_BG_SKIP_DEBOUNCE_MS;
    return {
      emit,
      gap,
      nextCallbackGap: state.lastCallbackGap,
      nextPublishOkGap: state.lastPublishOkGap,
      nextCallbackAtMs: state.lastCallbackAtMs,
      nextPublishOkAtMs: state.lastPublishOkAtMs,
    };
  }

  // skip — debounce identical class
  const skipKey = input.skip ?? 'skip';
  const last = state.lastSkipAt[skipKey];
  const emit =
    last == null || nowMs - last >= LOC_BG_SKIP_DEBOUNCE_MS;
  return {
    emit,
    gap,
    nextCallbackGap: state.lastCallbackGap,
    nextPublishOkGap: state.lastPublishOkGap,
    nextCallbackAtMs: state.lastCallbackAtMs,
    nextPublishOkAtMs: state.lastPublishOkAtMs,
  };
}

export function classifyAndroidStartBlock(
  reason: string | undefined,
  gateReason: string | undefined,
): LocBgStartBlockClass {
  const raw = (gateReason || reason || '').toLowerCase();
  if (raw.includes('session-unconfirmed')) return 'session_unconfirmed';
  if (raw.includes('approximate')) return 'approximate';
  if (raw.includes('visibility-off')) return 'visibility_off';
  if (raw.includes('bg-preference-off')) return 'bg_preference_off';
  if (
    raw.includes('foreground-denied') ||
    raw.includes('background-denied') ||
    raw.includes('needs-settings') ||
    raw.includes('permission')
  ) {
    return 'permission';
  }
  if (raw.includes('unauthenticated') || raw.includes('uid-mismatch')) {
    return 'logout';
  }
  return 'other';
}

export function classifyAndroidCallbackStop(input: {
  authUid: string | null;
  storedTaskUid: string | null;
  hasRuntimeAuth: boolean;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  fineLocationGranted: boolean;
}): LocBgStopClass {
  if (!input.authUid || !input.storedTaskUid) return 'logout';
  if (input.authUid !== input.storedTaskUid) return 'logout';
  if (!input.hasRuntimeAuth) return 'other';
  if (!input.foregroundGranted || !input.backgroundGranted) {
    return 'permission_revoked';
  }
  if (!input.fineLocationGranted) return 'approximate';
  return 'other';
}

export function classifyIosRuntimeStop(input: {
  hasUid: boolean;
  visibilityOn: boolean;
  bgVisible: boolean;
  permissionOk: boolean;
  startThrew: boolean;
}): LocBgStopClass {
  if (input.startThrew) return 'task_error';
  if (!input.hasUid) return 'logout';
  if (!input.visibilityOn) return 'visibility_off';
  if (!input.bgVisible) return 'bg_preference_off';
  if (!input.permissionOk) return 'permission_revoked';
  return 'other';
}

export function classifyCallableStop(input: {
  kind?: string;
  code?: string;
  reason?: string;
}): LocBgStopClass {
  const kind = String(input.kind ?? '').toLowerCase();
  const code = String(input.code ?? '')
    .replace(/^functions\//i, '')
    .toLowerCase();
  const reason = String(input.reason ?? '').toLowerCase();
  if (kind === 'permission-denied' || code === 'permission-denied') {
    return 'callable_permission';
  }
  if (code === 'unauthenticated') return 'callable_auth';
  if (reason === 'visibility-inactive') return 'visibility_off';
  if (code === 'failed-precondition' || reason.includes('app check')) {
    if (reason.includes('app check') || code === 'failed-precondition') {
      // Caller should only use this when disposition already decided stop
      // via App Check. visibility-inactive handled above.
      if (reason.includes('app check') || reason.includes('not ready')) {
        return 'callable_app_check';
      }
    }
  }
  return 'other';
}

export function configurePresenceDiagnostics(opts: {
  storage?: DiagStorage;
  log?: (line: string) => void;
  now?: () => number;
}): void {
  if (opts.storage) storage = opts.storage;
  if (opts.log) logImpl = opts.log;
  if (opts.now) nowImpl = opts.now;
}

export function resetPresenceDiagnosticsForTests(): void {
  memory = {
    ...EMPTY_STATE,
    lastSkipAt: {},
    lastBlockAt: {},
    counts: emptyCounts(),
    ring: [],
  };
  storage = null;
  logImpl = (line) => {
    console.log(line);
  };
  nowImpl = () => Date.now();
}

async function loadState(): Promise<PersistedDiag> {
  if (!storage) return memory;
  try {
    const raw = await storage.getItem(LOC_BG_STORAGE_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as Partial<PersistedDiag>;
    memory = {
      firstAtMs: typeof parsed.firstAtMs === 'number' ? parsed.firstAtMs : null,
      lastAtMs: typeof parsed.lastAtMs === 'number' ? parsed.lastAtMs : null,
      lastCallbackAtMs:
        typeof parsed.lastCallbackAtMs === 'number' ? parsed.lastCallbackAtMs : null,
      lastPublishOkAtMs:
        typeof parsed.lastPublishOkAtMs === 'number'
          ? parsed.lastPublishOkAtMs
          : null,
      lastCallbackGap: parsed.lastCallbackGap ?? null,
      lastPublishOkGap: parsed.lastPublishOkGap ?? null,
      lastSkipAt:
        parsed.lastSkipAt && typeof parsed.lastSkipAt === 'object'
          ? { ...parsed.lastSkipAt }
          : {},
      lastBlockAt:
        parsed.lastBlockAt && typeof parsed.lastBlockAt === 'object'
          ? { ...parsed.lastBlockAt }
          : {},
      counts: parseCounts(parsed.counts),
      ring: Array.isArray(parsed.ring) ? parsed.ring.slice(-LOC_BG_RING_LIMIT) : [],
    };
    return memory;
  } catch {
    return memory;
  }
}

async function saveState(next: PersistedDiag): Promise<void> {
  memory = next;
  if (!storage) return;
  try {
    await storage.setItem(LOC_BG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function ensureDefaultStorage(): Promise<void> {
  if (storage) return;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    storage = mod.default;
  } catch {
    storage = null;
  }
}

export async function recordPresenceEvent(input: LocBgInput): Promise<boolean> {
  await ensureDefaultStorage();
  const nowMs = nowImpl();
  const state = await loadState();
  const decision = decideLocBgEmit(state, input, nowMs);
  const counts = bumpLocBgCounts(state.counts ?? emptyCounts(), input);
  const firstAtMs = state.firstAtMs ?? nowMs;
  if (!decision.emit) {
    const skipped: PersistedDiag = {
      ...state,
      firstAtMs,
      lastAtMs: nowMs,
      lastCallbackAtMs: decision.nextCallbackAtMs,
      lastPublishOkAtMs: decision.nextPublishOkAtMs,
      counts,
    };
    await saveState(skipped);
    return false;
  }

  const record = sanitizeLocBgRecord({
    t: nowMs,
    e: input.event,
    plat: input.platform,
    stop: input.stop,
    skip: input.skip,
    block: input.block,
    acc:
      input.accuracyMeters !== undefined
        ? accuracyBucket(input.accuracyMeters)
        : undefined,
    gap: decision.gap,
    started: input.started,
    app: input.appState,
  });

  const lastSkipAt = { ...state.lastSkipAt };
  if (input.event === 'skip' && input.skip) {
    lastSkipAt[input.skip] = nowMs;
  }
  const lastBlockAt = { ...(state.lastBlockAt ?? {}) };
  if (input.event === 'start_blocked' && input.block) {
    lastBlockAt[input.block] = nowMs;
  }

  const ring = [...state.ring, record].slice(-LOC_BG_RING_LIMIT);
  const next: PersistedDiag = {
    firstAtMs,
    lastAtMs: nowMs,
    lastCallbackAtMs: decision.nextCallbackAtMs,
    lastPublishOkAtMs: decision.nextPublishOkAtMs,
    lastCallbackGap: decision.nextCallbackGap,
    lastPublishOkGap: decision.nextPublishOkGap,
    lastSkipAt,
    lastBlockAt,
    counts,
    ring,
  };
  await saveState(next);
  logImpl(formatLocBgLine(record));
  if (input.event === 'resume') {
    logImpl(formatLocBgRingLine(ring));
  }
  return true;
}

export function getPresenceDiagnosticsRingForTests(): LocBgRecord[] {
  return [...memory.ring];
}

export function getPresenceDiagnosticsCountsForTests(): LocBgCounts {
  return {
    ...memory.counts,
    skipBy: { ...memory.counts.skipBy },
    stopBy: { ...memory.counts.stopBy },
    blockBy: { ...memory.counts.blockBy },
  };
}

export function buildPresenceDiagnosticsExport(
  platform: LocBgPlatform,
  state: PersistedDiag = memory,
): LocBgExportPayload {
  const firstAt = state.firstAtMs;
  const lastAt = state.lastAtMs;
  const spanMs =
    firstAt != null && lastAt != null && lastAt >= firstAt ? lastAt - firstAt : 0;
  return {
    v: 1,
    kind: LOC_BG_EXPORT_KIND,
    build: LOC_BG_BUILD_LABEL,
    plat: platform,
    firstAt,
    lastAt,
    lastCallbackAt: state.lastCallbackAtMs,
    lastPublishOkAt: state.lastPublishOkAtMs,
    spanMin: Math.round(spanMs / 60_000),
    n: {
      ...emptyCounts(),
      ...state.counts,
      skipBy: { ...(state.counts?.skipBy ?? {}) },
      stopBy: { ...(state.counts?.stopBy ?? {}) },
      blockBy: { ...(state.counts?.blockBy ?? {}) },
    },
    ring: (state.ring ?? []).map((row) => sanitizeLocBgRecord(row)),
  };
}

export async function loadPresenceDiagnosticsExport(
  platform: LocBgPlatform,
): Promise<LocBgExportPayload> {
  await ensureDefaultStorage();
  const state = await loadState();
  return buildPresenceDiagnosticsExport(platform, state);
}

export function formatPresenceDiagnosticsExport(
  payload: LocBgExportPayload,
): string {
  return JSON.stringify({
    v: payload.v,
    kind: payload.kind,
    build: payload.build,
    plat: payload.plat,
    firstAt: payload.firstAt,
    lastAt: payload.lastAt,
    lastCallbackAt: payload.lastCallbackAt,
    lastPublishOkAt: payload.lastPublishOkAt,
    spanMin: payload.spanMin,
    n: payload.n,
    ring: payload.ring,
  });
}

export function isPresenceDiagnosticsExportEmpty(
  payload: LocBgExportPayload,
): boolean {
  return (
    payload.ring.length === 0 &&
    payload.n.callback === 0 &&
    payload.n.publish_ok === 0 &&
    payload.n.publish_fail === 0 &&
    payload.n.skip === 0 &&
    payload.n.stop === 0 &&
    payload.n.start_ok === 0 &&
    payload.n.start_blocked === 0
  );
}
