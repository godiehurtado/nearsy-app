/**
 * User-safe Visibility error presentation + development diagnostics.
 * Never logs tokens, PII, or coordinates.
 */

import type { TFunction } from 'i18next';

import {
  isVisibilityDiscoveryClientError,
  type VisibilityDiscoveryClientError,
  type VisibilityErrorReason,
  type VisibilityFirebaseErrorCode,
} from './callables/errors';

export type VisibilityErrorDiagnostic = {
  code: VisibilityFirebaseErrorCode | 'local';
  reason: string;
  field?: string;
  retryable: boolean;
};

export type VisibilityErrorPresentation = {
  title: string;
  userMessage: string;
  retryable: boolean;
  diagnostic: VisibilityErrorDiagnostic;
  devDetail: string;
};

export type VisibilityLocalErrorKind =
  | 'permission-denied'
  | 'unavailable'
  | 'invalid-accuracy';

function reasonToString(reason: VisibilityErrorReason): string {
  if (reason.kind === 'known') return reason.value;
  if (reason.kind === 'unknown') return reason.value;
  return 'none';
}

function buildDevDetail(diagnostic: VisibilityErrorDiagnostic): string {
  const parts = [
    `code=${diagnostic.code}`,
    `reason=${diagnostic.reason}`,
    `retryable=${diagnostic.retryable}`,
  ];
  if (diagnostic.field) parts.push(`field=${diagnostic.field}`);
  return parts.join(' · ');
}

function mapCallableError(
  err: VisibilityDiscoveryClientError,
  t: TFunction,
): Pick<VisibilityErrorPresentation, 'title' | 'userMessage' | 'retryable'> {
  const reason =
    err.reason.kind === 'known'
      ? err.reason.value
      : err.reason.kind === 'unknown'
        ? err.reason.value
        : null;

  if (reason === 'profile-incomplete') {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.profileIncomplete'),
      retryable: false,
    };
  }
  if (reason === 'invalid-location') {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.invalidLocation'),
      retryable: true,
    };
  }
  if (err.code === 'unauthenticated') {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.unauthenticated'),
      retryable: false,
    };
  }
  if (err.code === 'permission-denied' || reason === 'candidate-blocked') {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.permissionDenied'),
      retryable: false,
    };
  }
  if (reason === 'visibility-inactive') {
    return {
      title: t('home.visibility.inactive'),
      userMessage: t('home.errors.visibilityInactive'),
      retryable: false,
    };
  }
  if (
    err.code === 'unavailable' ||
    err.code === 'resource-exhausted' ||
    err.code === 'unknown'
  ) {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.networkUnavailable'),
      retryable: err.retryable,
    };
  }
  if (err.retryable) {
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.retry'),
      retryable: true,
    };
  }

  return {
    title: t('home.errors.title'),
    userMessage: t('home.errors.generic'),
    retryable: false,
  };
}

export function presentVisibilityCallableError(
  err: VisibilityDiscoveryClientError,
  t: TFunction,
): VisibilityErrorPresentation {
  const mapped = mapCallableError(err, t);
  const diagnostic: VisibilityErrorDiagnostic = {
    code: err.code,
    reason: reasonToString(err.reason),
    retryable: err.retryable,
    ...(err.field ? { field: err.field } : {}),
  };

  return {
    ...mapped,
    diagnostic,
    devDetail: buildDevDetail(diagnostic),
  };
}

export function presentVisibilityLocalError(
  kind: VisibilityLocalErrorKind,
  t: TFunction,
): VisibilityErrorPresentation {
  if (kind === 'permission-denied') {
    const diagnostic: VisibilityErrorDiagnostic = {
      code: 'local',
      reason: 'permission-denied',
      retryable: false,
    };
    return {
      title: t('home.visibility.inactive'),
      userMessage: t('nearby.hintWithoutLocation'),
      retryable: false,
      diagnostic,
      devDetail: buildDevDetail(diagnostic),
    };
  }
  if (kind === 'invalid-accuracy') {
    const diagnostic: VisibilityErrorDiagnostic = {
      code: 'local',
      reason: 'invalid-location',
      retryable: true,
    };
    return {
      title: t('home.errors.title'),
      userMessage: t('home.errors.invalidLocation'),
      retryable: true,
      diagnostic,
      devDetail: buildDevDetail(diagnostic),
    };
  }

  const diagnostic: VisibilityErrorDiagnostic = {
    code: 'local',
    reason: 'unavailable',
    retryable: true,
  };
  return {
    title: t('home.errors.title'),
    userMessage: t('home.errors.networkUnavailable'),
    retryable: true,
    diagnostic,
    devDetail: buildDevDetail(diagnostic),
  };
}

export function presentUnknownVisibilityError(
  t: TFunction,
): VisibilityErrorPresentation {
  const diagnostic: VisibilityErrorDiagnostic = {
    code: 'unknown',
    reason: 'unknown',
    retryable: false,
  };
  return {
    title: t('home.errors.title'),
    userMessage: t('home.errors.generic'),
    retryable: false,
    diagnostic,
    devDetail: buildDevDetail(diagnostic),
  };
}

export function logVisibilityErrorDiagnostic(
  context: string,
  presentation: VisibilityErrorPresentation,
  err?: unknown,
): void {
  if (!__DEV__) return;
  const payload = {
    context,
    ...presentation.diagnostic,
    message: presentation.userMessage,
  };
  if (isVisibilityDiscoveryClientError(err)) {
    console.warn('[Visibility]', payload);
    return;
  }
  console.warn('[Visibility]', payload, err instanceof Error ? err.name : '');
}
