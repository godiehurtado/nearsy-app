import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OTP_SIX_DIGIT_LENGTH,
  activeOtpCellIndex,
  isOtpCodeComplete,
  otpDigitCells,
  sanitizeOtpDigits,
} from '../../components/phoneOtp/otpSixDigitCells.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', '..', relativeFromSharedSrc), 'utf8');
}

describe('otp six digit helpers', () => {
  it('renders six empty cells when code is empty', () => {
    assert.deepEqual(otpDigitCells(''), ['', '', '', '', '', '']);
    assert.equal(activeOtpCellIndex(''), 0);
    assert.equal(isOtpCodeComplete(''), false);
  });

  it('distributes each digit into its own cell', () => {
    assert.deepEqual(otpDigitCells('123'), ['1', '2', '3', '', '', '']);
    assert.equal(activeOtpCellIndex('123'), 3);
  });

  it('fills all six cells for a complete code', () => {
    assert.deepEqual(otpDigitCells('123456'), ['1', '2', '3', '4', '5', '6']);
    assert.equal(activeOtpCellIndex('123456'), 5);
    assert.equal(isOtpCodeComplete('123456'), true);
  });

  it('filters non-numeric characters and truncates paste to six digits', () => {
    assert.equal(sanitizeOtpDigits('12a34b56c78'), '123456');
    assert.equal(sanitizeOtpDigits('12-34-56'), '123456');
    assert.deepEqual(otpDigitCells('12a34b56c78'), ['1', '2', '3', '4', '5', '6']);
  });

  it('keeps active index on the last cell when code is complete', () => {
    assert.equal(activeOtpCellIndex('999999'), OTP_SIX_DIGIT_LENGTH - 1);
  });
});

describe('otp six digit input component', () => {
  const component = readSharedSource('components/phoneOtp/OtpSixDigitInput.tsx');
  const screen = readSharedSource('screens/PhoneVerificationScreen.ios.tsx');

  it('uses a single hidden TextInput for all six visual cells', () => {
    assert.equal((component.match(/<TextInput\s/g) ?? []).length, 1);
    assert.match(component, /otpDigitCells/);
    assert.match(component, /digits\.map/);
  });

  it('preserves iOS OTP autofill attributes on the hidden input', () => {
    assert.match(component, /textContentType="oneTimeCode"/);
    assert.match(component, /autoComplete="sms-otp"/);
    assert.match(component, /keyboardType="number-pad"/);
    assert.match(component, /maxLength=\{OTP_SIX_DIGIT_LENGTH\}/);
    assert.match(component, /importantForAutofill="yes"/);
  });

  it('highlights the active cell and supports error styling', () => {
    assert.match(component, /activeOtpCellIndex/);
    assert.match(component, /hasError/);
    assert.match(component, /palette\.danger/);
    assert.match(component, /palette\.primary/);
  });

  it('focuses the hidden input when the cell group is pressed', () => {
    assert.match(component, /onPress=\{focusInput\}/);
    assert.match(component, /inputRef\.current\?\.focus/);
    assert.match(component, /pointerEvents="none"/);
    assert.match(component, /caretHidden/);
  });

  it('wires the iOS OTP screen through OtpSixDigitInput without FormInput in code step', () => {
    const codePhase = screen.match(
      /screenPhase === 'code'[\s\S]*?screenPhase === 'terminal'/,
    )?.[0];
    assert.ok(codePhase);
    assert.match(codePhase!, /OtpSixDigitInput/);
    assert.doesNotMatch(codePhase!, /FormInput/);
    assert.match(screen, /view\.code\.length !== 6/);
    assert.match(screen, /styles\.primaryActionSection/);
    assert.match(screen, /marginTop:\s*spacing\.lg/);
  });

  it('exposes accessible OTP entry metadata for VoiceOver', () => {
    assert.match(component, /accessibilityLabel=\{accessibilityLabel\}/);
    assert.match(component, /accessibilityValue/);
    assert.match(component, /importantForAccessibility="no-hide-descendants"/);
  });
});
