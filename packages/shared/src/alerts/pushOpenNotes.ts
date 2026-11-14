/**
 * Push opens waiting to mark their alert read (QA 2.1.0 item 5, agreed with
 * iOS). An alert is read when its detail is opened: from the inbox row, or
 * from its push once the app actually navigated to the profile. The push names
 * the actor, not the appearance, so the note is resolved when that peer's alert
 * is listed with its live appearanceKey. Notes are per viewer uid and expire
 * after PUSH_OPEN_NOTE_TTL_MS; nothing is persisted.
 */

export const PUSH_OPEN_NOTE_TTL_MS = 10 * 60 * 1000;

type Note = { viewerUid: string; actorUid: string; at: number };

export function createPushOpenNotes(now: () => number) {
  let notes: Note[] = [];
  const listeners = new Set<() => void>();
  const live = () => {
    const cutoff = now() - PUSH_OPEN_NOTE_TTL_MS;
    notes = notes.filter((n) => n.at >= cutoff);
    return notes;
  };
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    note(viewerUid: string | null | undefined, actorUid: string | null | undefined): void {
      if (!viewerUid || !actorUid || viewerUid === actorUid) return;
      notes = live().filter((n) => !(n.viewerUid === viewerUid && n.actorUid === actorUid));
      notes.push({ viewerUid, actorUid, at: now() });
      emit();
    },
    /** Actors with an open push for this viewer, newest last. */
    pendingFor(viewerUid: string | null | undefined): string[] {
      if (!viewerUid) return [];
      return live()
        .filter((n) => n.viewerUid === viewerUid)
        .map((n) => n.actorUid);
    },
    resolve(viewerUid: string, actorUid: string): void {
      notes = live().filter((n) => !(n.viewerUid === viewerUid && n.actorUid === actorUid));
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type PushOpenNotes = ReturnType<typeof createPushOpenNotes>;

/** Process-wide instance: the push coordinator notes, the alerts state resolves. */
export const pushOpenNotes: PushOpenNotes = createPushOpenNotes(() => Date.now());
