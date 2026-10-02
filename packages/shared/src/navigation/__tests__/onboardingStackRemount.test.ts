/**
 * DOB loop after signup: the onboarding stack must restart on the resolver's
 * step without React Navigation rehydrating the previous stack's state.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/navigation/__tests__/onboardingStackRemount.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createProfileGateController,
  resolveAuthenticatedProfileFlow,
  shouldRenderOnboardingStack,
  type AuthenticatedProfileFlow,
} from '../profileGate.ts';

const UID = 'uid-new-account';
const DOB_WRITE = { birthDate: '1990-06-15', phoneVerified: false };

type Commit = 'loader' | 'main' | `stack:${string}`;

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

function wait(ms = 5): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function needsOnboarding(kind: AuthenticatedProfileFlow['kind']): boolean {
  return (
    kind === 'OnboardingBirthDate' ||
    kind === 'PhoneVerification' ||
    kind === 'ProfileCompletion'
  );
}

/**
 * Mirrors AppNavigator's flowKey + mountedOnboardingKey render/effect cycle.
 * Each `commit` is what React would paint for one render pass.
 */
function createShellModel() {
  const commits: Commit[] = [];
  let mountedOnboardingKey: string | null = null;
  let flow: AuthenticatedProfileFlow = { kind: 'loading' };

  function flowKey(): string {
    if (flow.kind === 'loading') return 'loading';
    if (needsOnboarding(flow.kind)) return `auth-complete-${UID}-${flow.kind}`;
    return `auth-main-${UID}`;
  }

  function render(): Commit {
    const key = flowKey();
    if (flow.kind === 'loading') return 'loader';
    if (needsOnboarding(flow.kind)) {
      return shouldRenderOnboardingStack({ flowKey: key, mountedOnboardingKey })
        ? `stack:${flow.kind}`
        : 'loader';
    }
    return 'main';
  }

  function settle() {
    for (let i = 0; i < 4; i += 1) {
      const commit = render();
      if (commits.at(-1) !== commit) commits.push(commit);
      const next = needsOnboarding(flow.kind) ? flowKey() : null;
      if (next === mountedOnboardingKey) return;
      mountedOnboardingKey = next;
    }
  }

  return {
    commits,
    onFlow(next: AuthenticatedProfileFlow) {
      flow = next;
      settle();
    },
  };
}

/** Firestore-like doc source: snapshot listener + server get. */
function createProfileSource(initial: unknown) {
  let doc: unknown = initial;
  let emit: ((d: unknown) => void) | null = null;
  return {
    listen: (_uid: string, onData: (d: unknown) => void) => {
      emit = onData;
      queueMicrotask(() => onData(doc));
      return () => {
        emit = null;
      };
    },
    get: async () => doc,
    write(patch: Record<string, unknown>) {
      doc = { ...((doc as Record<string, unknown>) ?? {}), ...patch };
      emit?.(doc);
    },
  };
}

async function runSignup(initialDoc: unknown) {
  const source = createProfileSource(initialDoc);
  const shell = createShellModel();
  const flows: AuthenticatedProfileFlow['kind'][] = [];
  const gate = createProfileGateController({
    listen: source.listen,
    get: source.get,
    absentConfirmMs: 0,
  });
  gate.start(UID, (status) => {
    const flow = resolveAuthenticatedProfileFlow(status);
    flows.push(flow.kind);
    shell.onFlow(flow);
  });
  await wait();
  return { source, shell, flows, gate };
}

function stackMounts(commits: Commit[], kind: string): number {
  return commits.filter((c) => c === `stack:${kind}`).length;
}

/** A stack→stack commit with a different key reuses navigator state. */
function directStackSwaps(commits: Commit[]): Array<[Commit, Commit]> {
  const swaps: Array<[Commit, Commit]> = [];
  for (let i = 1; i < commits.length; i += 1) {
    const prev = commits[i - 1];
    const cur = commits[i];
    if (prev.startsWith('stack:') && cur.startsWith('stack:') && prev !== cur) {
      swaps.push([prev, cur]);
    }
  }
  return swaps;
}

describe('shouldRenderOnboardingStack', () => {
  it('renders only once the mounted key caught up with flowKey', () => {
    const dob = `auth-complete-${UID}-OnboardingBirthDate`;
    const otp = `auth-complete-${UID}-PhoneVerification`;
    assert.equal(
      shouldRenderOnboardingStack({ flowKey: dob, mountedOnboardingKey: null }),
      false,
    );
    assert.equal(
      shouldRenderOnboardingStack({ flowKey: dob, mountedOnboardingKey: dob }),
      true,
    );
    assert.equal(
      shouldRenderOnboardingStack({ flowKey: otp, mountedOnboardingKey: dob }),
      false,
    );
    assert.equal(
      shouldRenderOnboardingStack({ flowKey: otp, mountedOnboardingKey: otp }),
      true,
    );
  });
});

describe('DOB advances once after signup', () => {
  it('new Facebook user without email: DOB → OTP, each stack mounted once', async () => {
    const { source, shell, flows, gate } = await runSignup(null);
    assert.equal(flows.at(-1), 'OnboardingBirthDate');
    assert.deepEqual(shell.commits, ['loader', 'stack:OnboardingBirthDate']);

    source.write(DOB_WRITE);
    await wait();

    assert.equal(flows.at(-1), 'PhoneVerification');
    assert.deepEqual(shell.commits, [
      'loader',
      'stack:OnboardingBirthDate',
      'loader',
      'stack:PhoneVerification',
    ]);
    assert.equal(stackMounts(shell.commits, 'OnboardingBirthDate'), 1);
    assert.equal(stackMounts(shell.commits, 'PhoneVerification'), 1);
    assert.deepEqual(directStackSwaps(shell.commits), []);
    gate.stop();
  });

  it('valid DOB never returns to the DOB stack', async () => {
    const { source, shell, gate } = await runSignup(null);
    source.write(DOB_WRITE);
    await wait();
    source.write({ email: null });
    await wait();
    const afterDob = shell.commits.slice(
      shell.commits.indexOf('stack:OnboardingBirthDate') + 1,
    );
    assert.equal(afterDob.includes('stack:OnboardingBirthDate'), false);
    gate.stop();
  });

  it('new Facebook user with email: same DOB → OTP sequence', async () => {
    const { source, shell, flows, gate } = await runSignup({
      email: 'present@example.test',
      profileSetupCompleted: false,
    });
    assert.equal(flows.at(-1), 'OnboardingBirthDate');
    source.write(DOB_WRITE);
    await wait();
    assert.equal(flows.at(-1), 'PhoneVerification');
    assert.equal(stackMounts(shell.commits, 'OnboardingBirthDate'), 1);
    assert.equal(stackMounts(shell.commits, 'PhoneVerification'), 1);
    assert.deepEqual(directStackSwaps(shell.commits), []);
    gate.stop();
  });

  it('OTP verified → CRJ also restarts on a fresh stack', async () => {
    const { source, shell, gate } = await runSignup(null);
    source.write(DOB_WRITE);
    await wait();
    source.write({ phoneVerified: true });
    await wait();
    assert.equal(shell.commits.at(-1), 'stack:ProfileCompletion');
    assert.equal(stackMounts(shell.commits, 'ProfileCompletion'), 1);
    assert.deepEqual(directStackSwaps(shell.commits), []);
    gate.stop();
  });

  it('existing user goes straight to MainTabs, no onboarding stack', async () => {
    const { shell, flows, gate } = await runSignup({
      profileSetupCompleted: true,
      birthDate: '1990-06-15',
      phoneVerified: true,
    });
    assert.equal(flows.at(-1), 'MainTabs');
    assert.deepEqual(shell.commits, ['loader', 'main']);
    gate.stop();
  });
});

describe('Google / LinkedIn / email share the provider-agnostic gate', () => {
  for (const provider of ['google.com', 'linkedin', 'password']) {
    it(`${provider}: absent doc → DOB → OTP without stack reuse`, async () => {
      const { source, shell, gate } = await runSignup(null);
      source.write({ ...DOB_WRITE, provider });
      await wait();
      assert.equal(shell.commits.at(-1), 'stack:PhoneVerification');
      assert.deepEqual(directStackSwaps(shell.commits), []);
      gate.stop();
    });
  }

  it('email registration that already wrote DOB lands on OTP directly', async () => {
    const { shell, gate } = await runSignup({ ...DOB_WRITE, provider: 'password' });
    assert.deepEqual(shell.commits, ['loader', 'stack:PhoneVerification']);
    gate.stop();
  });
});

describe('AppNavigator wiring', () => {
  it('gates the onboarding stack on the mounted key', () => {
    const nav = readSource('../AppNavigator.tsx');
    assert.match(nav, /shouldRenderOnboardingStack\(\{ flowKey, mountedOnboardingKey \}\)/);
    assert.match(nav, /setMountedOnboardingKey\(needsOnboarding \? flowKey : null\)/);
    assert.match(nav, /`auth-complete-\$\{uid\}-\$\{profileFlow\.kind\}`/);
  });

  it('profile gate has no provider branching', () => {
    const gate = readSource('../profileGate.ts');
    assert.doesNotMatch(gate, /providerId|providerData|signInProvider/);
  });
});
