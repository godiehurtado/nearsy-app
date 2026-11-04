/**
 * Save queue for one account's Home filters. No Firebase / RN.
 *
 * One write at a time, so replies cannot arrive out of order. Each write sends only
 * the edited fields of one mode: the other mode and untouched fields are never
 * copied from local state, so nothing stored is repaired or replaced by defaults.
 * What the UI shows is always derived: last confirmed + what is still unsent.
 */
import type { PrefsFieldPatch } from './preferenceDraft.ts';
import type {
  ProfileMode,
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types.ts';

export type SearchPreferenceFields = Partial<
  Pick<
    VisibilitySearchPreferences,
    'ageMin' | 'ageMax' | 'maxDistanceMeters' | 'interestIds'
  >
>;

export type StoredSearchPreferenceModes = Record<ProfileMode, boolean>;

function isMap(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Which modes have a stored map. An invalid map still counts: it is not ours to replace. */
export function storedSearchPreferenceModes(
  userDoc: Record<string, unknown> | null | undefined,
): StoredSearchPreferenceModes {
  const raw = userDoc?.searchPreferences;
  const bag = isMap(raw) ? (raw as Record<string, unknown>) : {};
  return {
    personal: isMap(bag.personal),
    professional: isMap(bag.professional),
  };
}

export function searchPreferenceFieldsFromPatch(
  patch: PrefsFieldPatch,
): SearchPreferenceFields {
  switch (patch.kind) {
    case 'age':
      return { ageMin: patch.ageMin, ageMax: patch.ageMax };
    case 'distance':
      return { maxDistanceMeters: patch.maxDistanceMeters };
    case 'interests':
      return { interestIds: [...patch.interestIds] };
  }
}

/** The Firestore merge payload: nested maps merge key by key. */
export function buildSearchPreferencesModeWrite(
  mode: ProfileMode,
  fields: SearchPreferenceFields,
  updatedAt: number,
): { searchPreferences: Partial<Record<ProfileMode, Record<string, unknown>>> } {
  return { searchPreferences: { [mode]: { ...fields, updatedAt } } };
}

export type SearchPreferencesWriterDeps = {
  uid: string;
  initial: VisibilitySearchPreferencesByMode;
  /** Checked before each send: the token follows the signed-in user. */
  isCurrent: () => boolean;
  write: (
    mode: ProfileMode,
    fields: SearchPreferenceFields,
    updatedAt: number,
  ) => Promise<void>;
  onChange: (draft: VisibilitySearchPreferencesByMode) => void;
  /** The newest intent of a mode failed and was rolled back. */
  onFailure: (mode: ProfileMode, error: unknown) => void;
  now?: () => number;
};

export function createSearchPreferencesWriter(deps: SearchPreferencesWriterDeps) {
  const now = deps.now ?? Date.now;
  let confirmed = deps.initial;
  let stored: StoredSearchPreferenceModes = {
    personal: false,
    professional: false,
  };
  /** False until the first read: never write before knowing what is stored. */
  let ready = false;
  let disposed = false;
  let inFlight: { mode: ProfileMode; intent: SearchPreferenceFields } | null = null;
  const pending: Partial<Record<ProfileMode, SearchPreferenceFields>> = {};
  const queue: ProfileMode[] = [];

  function getDraft(): VisibilitySearchPreferencesByMode {
    const forMode = (mode: ProfileMode): VisibilitySearchPreferences => ({
      ...confirmed[mode],
      ...(inFlight?.mode === mode ? inFlight.intent : null),
      ...pending[mode],
    });
    return { personal: forMode('personal'), professional: forMode('professional') };
  }

  function emit(): void {
    deps.onChange(getDraft());
  }

  function dispose(): void {
    disposed = true;
    inFlight = null;
    queue.length = 0;
    delete pending.personal;
    delete pending.professional;
  }

  function pump(): void {
    if (disposed || inFlight) return;
    const mode = queue.shift();
    if (!mode) return;
    if (!deps.isCurrent()) {
      dispose();
      return;
    }
    const intent = pending[mode] ?? {};
    delete pending[mode];
    inFlight = { mode, intent };

    // No stored map: the contract needs a complete one, so this first write
    // creates it. An existing map only ever receives the edited fields.
    const base = confirmed[mode];
    const fields: SearchPreferenceFields = stored[mode]
      ? intent
      : {
          ageMin: base.ageMin,
          ageMax: base.ageMax,
          maxDistanceMeters: base.maxDistanceMeters,
          interestIds: base.interestIds,
          ...intent,
        };
    const updatedAt = now();

    let request: Promise<void>;
    try {
      request = deps.write(mode, fields, updatedAt);
    } catch (err) {
      request = Promise.reject(err);
    }
    request.then(
      () => {
        if (disposed) return;
        // Confirmed even if a newer intent exists: this one did reach the server.
        confirmed = {
          ...confirmed,
          [mode]: { ...confirmed[mode], ...fields, updatedAt },
        };
        stored = { ...stored, [mode]: true };
        inFlight = null;
        emit();
        pump();
      },
      (err) => {
        if (disposed) return;
        inFlight = null;
        const newer = pending[mode];
        if (newer) {
          // The user still wants these too: they go with the newer intent, whose
          // result decides. Field-level writes would otherwise lose them.
          pending[mode] = { ...intent, ...newer };
          emit();
        } else {
          emit();
          deps.onFailure(mode, err);
        }
        pump();
      },
    );
  }

  return {
    uid: deps.uid,
    getDraft,
    /** Applies a read of the user doc. While saving, local intent wins: returns false. */
    applyRemote(
      remote: VisibilitySearchPreferencesByMode,
      storedModes: StoredSearchPreferenceModes,
    ): boolean {
      if (disposed || inFlight || queue.length > 0) return false;
      confirmed = remote;
      stored = storedModes;
      ready = true;
      emit();
      return true;
    },
    /** Returns false when nothing was queued. */
    patch(mode: ProfileMode, fields: SearchPreferenceFields): boolean {
      if (disposed || !ready) return false;
      pending[mode] = { ...pending[mode], ...fields };
      if (!queue.includes(mode)) queue.push(mode);
      emit();
      pump();
      return true;
    },
    /** Drops unsent intent and ignores replies still in the air. */
    dispose,
  };
}

export type SearchPreferencesWriter = ReturnType<
  typeof createSearchPreferencesWriter
>;
