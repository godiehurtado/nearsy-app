import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { fontSize, fontWeight } from '../../theme/typography';

interface Props extends TextInputProps {
  label?: string;
  errorText?: string;
}

/** Themed form input (nearsy-rn-v3 TextField). */
export function FormInput({ label, errorText, style, ...inputProps }: Props) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const hasError = !!errorText;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={palette.placeholder}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: palette.textPrimary,
            borderColor: hasError
              ? palette.danger
              : focused
                ? palette.primary
                : palette.borderStrong,
            backgroundColor: palette.surface,
          },
          style,
        ]}
        {...inputProps}
      />
      {hasError ? (
        <Text style={[styles.error, { color: palette.danger }]}>{errorText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 7,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    fontSize: fontSize.md,
  },
  error: {
    fontSize: fontSize.xs,
    marginTop: 6,
    fontWeight: fontWeight.semibold,
  },
});
