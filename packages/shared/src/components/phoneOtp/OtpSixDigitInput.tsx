import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
} from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  OTP_SIX_DIGIT_LENGTH,
  activeOtpCellIndex,
  otpDigitCells,
  sanitizeOtpDigits,
} from './otpSixDigitCells';

export type OtpSixDigitInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  label?: string;
  accessibilityLabel: string;
  hasError?: boolean;
  disabled?: boolean;
};

export function OtpSixDigitInput({
  value,
  onChangeText,
  label,
  accessibilityLabel,
  hasError = false,
  disabled = false,
}: OtpSixDigitInputProps) {
  const { palette } = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = useMemo(
    () => otpDigitCells(value, OTP_SIX_DIGIT_LENGTH),
    [value],
  );
  const activeIndex = useMemo(
    () => activeOtpCellIndex(value, OTP_SIX_DIGIT_LENGTH),
    [value],
  );

  const focusInput = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  const handleChangeText = useCallback(
    (next: string) => {
      onChangeText(sanitizeOtpDigits(next, OTP_SIX_DIGIT_LENGTH));
    },
    [onChangeText],
  );

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      ) : null}
      <Pressable
        onPress={focusInput}
        disabled={disabled}
        style={styles.pressable}
        accessibilityRole="none"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{
          text: `${sanitizeOtpDigits(value).length} of ${OTP_SIX_DIGIT_LENGTH}`,
        }}
        accessibilityState={{ disabled }}
      >
        <View
          style={styles.cellsRow}
          importantForAccessibility="no-hide-descendants"
        >
          {digits.map((digit, index) => {
            const isActive = focused && index === activeIndex;
            const borderColor = hasError
              ? palette.danger
              : isActive
                ? palette.primary
                : palette.borderStrong;
            const backgroundColor = isActive ? palette.panel : palette.surface;

            return (
              <View
                key={`otp-cell-${index}`}
                style={[
                  styles.cell,
                  {
                    borderColor,
                    backgroundColor,
                    borderWidth: isActive || hasError ? 2 : 1,
                    opacity: disabled ? 0.72 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.cellDigit, { color: palette.textPrimary }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {digit}
                </Text>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={OTP_SIX_DIGIT_LENGTH}
          caretHidden
          pointerEvents="none"
          importantForAutofill="yes"
          accessibilityLabel={accessibilityLabel}
          accessibilityElementsHidden={false}
          style={styles.hiddenInput}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 7,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  pressable: {
    position: 'relative',
    width: '100%',
  },
  cellsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  cell: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDigit: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01,
    color: 'transparent',
  },
});
