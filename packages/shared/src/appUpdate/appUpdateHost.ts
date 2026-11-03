import type { AppUpdateMandatoryCopy } from './noticeSession.ts';

/** State the host renders while a mandatory update surface is active. */
export type AppUpdateMandatoryState = {
  copy: AppUpdateMandatoryCopy;
  onUpdate: () => void;
};

export type AppUpdateHostState = {
  mandatory: AppUpdateMandatoryState | null;
};
