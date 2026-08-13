/**
 * Development-only LinkedIn A3 App Check preflight + Start smoke panel.
 * Never auto-runs. Never opens browser / OAuth / Exchange.
 * Start is limited to one invocation per panel session.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';

import { formatAppCheckDiagnosticLine } from '../authentication/linkedinA3/appCheck/appCheckDiagnostics';
import { runLinkedInA3AppCheckPreflight } from '../authentication/linkedinA3/smoke/appCheckPreflight';
import type { AppCheckPreflightReport } from '../authentication/linkedinA3/smoke/appCheckPreflightTypes';
import { runLinkedInAuthStartSmoke } from '../authentication/linkedinA3/smoke/linkedInAuthStartSmoke';
import type { LinkedInA3StartSmokeReport } from '../authentication/linkedinA3/smoke/linkedInAuthStartSmokeTypes';

type Phase = 'idle' | 'preflight' | 'ready' | 'start' | 'done' | 'blocked';

function formatPreflight(r: AppCheckPreflightReport): string {
  const attempts = r.attempts
    .map((a) => {
      const base = `attempt ${a.attempt}: init=${a.initialization}, token=${
        a.tokenObtained ? 'yes' : 'no'
      }${a.errorCode ? `, code=${a.errorCode}` : ''}${
        a.causeCode ? `, cause=${a.causeCode}` : ''
      }`;
      const diag = a.diagnostic
        ? `\n${formatAppCheckDiagnosticLine(a.diagnostic)}`
        : '';
      return `${base}${diag}`;
    })
    .join('\n\n');

  const telemetry = r.telemetry
    ? [
        `telemetry.createPortCalls = ${r.telemetry.createPortCalls}`,
        `telemetry.initializeAppCheckCalls = ${r.telemetry.initializeAppCheckCalls}`,
        `telemetry.getTokenCalls = ${r.telemetry.getTokenCalls}`,
        `telemetry.sharedInitState = ${r.telemetry.sharedInitState}`,
      ].join('\n')
    : '';

  const initLabel = r.appCheckInitialized ? 'ready' : 'failed';

  return [
    `environment = ${r.environment}`,
    `Firebase project expected = ${r.firebaseProjectIdExpected}`,
    `JS project = ${r.jsProjectId ?? 'n/a'}`,
    `native project = ${r.nativeProjectId ?? 'n/a'}`,
    `bundle ID = ${r.bundleId ?? 'n/a'}`,
    `App Check provider = ${r.appCheckProvider}`,
    `LinkedIn enabled = ${r.linkedInEnabled}`,
    `debug token configured = ${r.debugTokenConfigured}`,
    `App Check initialization = ${initLabel}`,
    `token obtained = ${r.tokenObtained ? 'yes' : 'no'}`,
    `phase = ${r.phase}`,
    `overall token readiness = ${r.overall}`,
    `first-init defect observed = ${r.firstInitDefectObserved}`,
    telemetry,
    attempts,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatStart(r: LinkedInA3StartSmokeReport): string {
  if (!r.ok) {
    return `Start smoke FAILED\nerrorCode = ${r.errorCode ?? 'unknown'}`;
  }
  return [
    'Start smoke OK',
    `transactionId = ${r.transactionIdSanitized ?? 'present(truncated)'}`,
    `authorizationUrl = ${r.authorizationHostPath ?? 'present(sanitized)'}`,
    `expiresAt present = ${r.hasExpiresAt}`,
    'browser/OAuth/callback/Exchange = not executed',
  ].join('\n');
}

export function LinkedInA3DevSmokePanel() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [preflightText, setPreflightText] = useState<string | null>(null);
  const [startText, setStartText] = useState<string | null>(null);
  const [preflightOk, setPreflightOk] = useState(false);
  /** Exactly one Start per panel mount/session. */
  const [startConsumed, setStartConsumed] = useState(false);

  const canStart =
    preflightOk && !busy && !startConsumed && phase === 'ready';

  const onPreflight = async () => {
    if (busy || startConsumed) return;
    setBusy(true);
    setPhase('preflight');
    setStartText(null);
    try {
      const report = await runLinkedInA3AppCheckPreflight();
      setPreflightText(formatPreflight(report));
      if (report.tokenObtained && report.overall === 'ready') {
        setPreflightOk(true);
        setPhase('ready');
      } else {
        setPreflightOk(false);
        setPhase('blocked');
      }
    } catch (e) {
      setPreflightOk(false);
      setPhase('blocked');
      setPreflightText(
        `App Check initialization = failed\ntoken obtained = no\nphase = blocked\nerror = ${(e as Error)?.message ?? 'unknown'}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onStartSmoke = async () => {
    if (!canStart) return;
    setBusy(true);
    setStartConsumed(true);
    setPhase('start');
    try {
      const report = await runLinkedInAuthStartSmoke();
      setStartText(formatStart(report));
      setPhase('done');
    } catch (e) {
      setStartText(
        `Start smoke FAILED\nerror = ${(e as Error)?.message ?? 'unknown'}`,
      );
      setPhase('done');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} accessibilityLabel="LinkedIn A3 Development smoke">
      <Text style={styles.title}>I1 Dev smoke (manual)</Text>
      <Text style={styles.hint}>
        Never auto-runs. Preflight first, then exactly one Start per panel
        session. Single preflight attempt (no automatic second retry).
      </Text>

      <Pressable
        style={[styles.btn, (busy || startConsumed) && styles.btnDisabled]}
        disabled={busy || startConsumed}
        onPress={() => {
          void onPreflight();
        }}
      >
        <Text style={styles.btnText}>1. App Check preflight</Text>
      </Pressable>

      <Pressable
        style={[
          styles.btn,
          styles.btnSecondary,
          !canStart && styles.btnDisabled,
        ]}
        disabled={!canStart}
        onPress={() => {
          void onStartSmoke();
        }}
      >
        <Text style={styles.btnText}>2. linkedinAuthStart smoke (once)</Text>
      </Pressable>

      {busy ? <ActivityIndicator color="#E2E8F0" style={styles.spinner} /> : null}
      {preflightText ? (
        <Text style={styles.mono} selectable>
          {preflightText}
        </Text>
      ) : null}
      {startText ? (
        <Text style={styles.mono} selectable>
          {startText}
        </Text>
      ) : null}
      <Text style={styles.phase}>phase = {phase}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  hint: {
    fontSize: 11,
    color: '#CBD5E1',
    marginBottom: 4,
  },
  btn: {
    backgroundColor: '#0F172A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#64748B',
  },
  btnSecondary: {
    backgroundColor: '#1E293B',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
  },
  spinner: {
    marginVertical: 8,
  },
  mono: {
    fontSize: 11,
    fontFamily: 'Courier',
    color: '#F1F5F9',
    lineHeight: 16,
  },
  phase: {
    fontSize: 10,
    color: '#E2E8F0',
  },
});
