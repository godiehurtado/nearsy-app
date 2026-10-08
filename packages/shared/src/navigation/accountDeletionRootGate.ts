/**
 * Root-navigator side of the account deletion exit barrier
 * (accountDeletion/accountDeletionExit.ts). While a deletion is in flight or
 * closing, the profile gate must never resolve onboarding (DOB / OTP / CRJ)
 * or Home for the account being deleted; the unauthenticated root decides
 * the final destination.
 */

import {
  isAuthenticatedProfileLoading,
  type AuthenticatedProfileFlow,
} from './profileGate.ts';
import type { AccountDeletionPhase } from '../accountDeletion/accountDeletionExit.ts';

type FlowListener = (flow: AuthenticatedProfileFlow) => void;

type ProfileGate = {
  start: (uid: string, onFlow: FlowListener) => void;
  retry: (uid: string, onFlow: FlowListener) => void;
  stop: () => void;
};

type DeletionPhaseSource = {
  getPhase: () => AccountDeletionPhase;
  subscribe: (listener: () => void) => () => void;
};

export function isProfileGateSuspended(phase: AccountDeletionPhase): boolean {
  return phase === 'exiting' || phase === 'signed_out';
}

/** The deleted session counts as signed out even if Auth has not caught up. */
export function resolveSessionUid(
  phase: AccountDeletionPhase,
  uid: string | null,
): string | null {
  return phase === 'signed_out' ? null : uid;
}

export type RootView = 'loader' | 'guest' | 'profile_error' | 'onboarding' | 'main';

export function resolveRootView(input: {
  deletionPhase: AccountDeletionPhase;
  uid: string | null;
  startupLoading: boolean;
  profileFlowKind: AuthenticatedProfileFlow['kind'];
}): RootView {
  const { deletionPhase, uid, startupLoading, profileFlowKind } = input;
  if (startupLoading || deletionPhase === 'exiting') return 'loader';
  // Auth dropped mid-request: wait for the outcome before mounting a stack.
  if (deletionPhase === 'deleting' && !uid) return 'loader';
  const sessionUid = resolveSessionUid(deletionPhase, uid);
  if (!sessionUid) return 'guest';
  if (isAuthenticatedProfileLoading(sessionUid, profileFlowKind)) return 'loader';
  switch (profileFlowKind) {
    case 'profile_read_error':
      return 'profile_error';
    case 'OnboardingBirthDate':
    case 'PhoneVerification':
    case 'ProfileCompletion':
      return 'onboarding';
    default:
      return 'main';
  }
}

/**
 * Profile gate that honours the deletion barrier:
 * - idle: flows pass through.
 * - deleting: the latest flow is held (the profile document may already be
 *   gone) and delivered only if the request is abandoned.
 * - exiting / signed_out: the gate is stopped, held flows are dropped and the
 *   listener receives `loading` once; `start` and `retry` are no-ops.
 */
export function createDeletionAwareProfileGate(deps: {
  gate: ProfileGate;
  exit: DeletionPhaseSource;
}) {
  const { gate, exit } = deps;
  let onFlow: FlowListener | null = null;
  let held: AuthenticatedProfileFlow | null = null;
  let lastPhase = exit.getPhase();

  function deliver(listener: FlowListener, flow: AuthenticatedProfileFlow) {
    if (listener !== onFlow) return;
    const phase = exit.getPhase();
    if (phase === 'idle') {
      listener(flow);
    } else if (phase === 'deleting') {
      held = flow;
    }
  }

  function onPhaseChange() {
    const phase = exit.getPhase();
    const previous = lastPhase;
    lastPhase = phase;
    if (isProfileGateSuspended(phase)) {
      if (isProfileGateSuspended(previous)) return;
      gate.stop();
      held = null;
      const listener = onFlow;
      onFlow = null;
      listener?.({ kind: 'loading' });
      return;
    }
    if (phase === 'idle' && previous === 'deleting' && held && onFlow) {
      const flow = held;
      held = null;
      onFlow(flow);
    }
  }

  function run(
    method: 'start' | 'retry',
    uid: string,
    listener: FlowListener,
  ): void {
    if (isProfileGateSuspended(exit.getPhase())) return;
    held = null;
    onFlow = listener;
    gate[method](uid, (flow) => deliver(listener, flow));
  }

  return {
    start: (uid: string, listener: FlowListener) => run('start', uid, listener),
    retry: (uid: string, listener: FlowListener) => run('retry', uid, listener),
    stop(): void {
      onFlow = null;
      held = null;
      gate.stop();
    },
    /** Subscribes to the barrier; returns the matching unsubscribe. */
    connect(): () => void {
      lastPhase = exit.getPhase();
      return exit.subscribe(onPhaseChange);
    },
  };
}
