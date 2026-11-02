import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { fontSize, fontWeight } from '../../theme/typography';
import { useTranslation } from '../../i18n';
import { usePasswordVisibility } from '../usePasswordVisibility';

interface Props extends TextInputProps {
  label?: string;
  errorText?: string;
  /** Starts hidden. Does not change autofill, keyboard, or auth. */
  enablePasswordToggle?: boolean;
}

/** Themed form input (nearsy-rn-v3 TextField). */
export function FormInput({
  label,
  errorText,
  style,
  enablePasswordToggle = false,
  ...inputProps
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const password = usePasswordVisibility(true);
  const hasError = !!errorText;
  const hidden = enablePasswordToggle && password.hidden;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      ) : null}
      <View style={styles.inputRow}>
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
            enablePasswordToggle ? styles.inputWithToggle : null,
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
          secureTextEntry={enablePasswordToggle ? password.secureTextEntry : inputProps.secureTextEntry}
          autoCapitalize={enablePasswordToggle ? 'none' : inputProps.autoCapitalize}
          autoCorrect={enablePasswordToggle ? false : inputProps.autoCorrect}
          textContentType={
            enablePasswordToggle
              ? (inputProps.textContentType ?? 'password')
              : inputProps.textContentType
          }
          autoComplete={
            enablePasswordToggle
              ? (inputProps.autoComplete ?? 'password')
              : inputProps.autoComplete
          }
          selection={enablePasswordToggle ? password.selection : inputProps.selection}
          onSelectionChange={
            enablePasswordToggle
              ? password.onSelectionChange
              : inputProps.onSelectionChange
          }
        />
        {enablePasswordToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hidden
                ? t('authentication.login.showPassword')
                : t('authentication.login.hidePassword')
            }
            accessibilityState={{ selected: !hidden }}
            onPress={password.toggle}
            hitSlop={8}
            style={styles.eyeButton}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={palette.placeholder}
            />
          </Pressable>
        ) : null}
      </View>
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
  inputRow: {
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    fontSize: fontSize.md,
  },
  inputWithToggle: {
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: fontSize.xs,
    marginTop: 6,
    fontWeight: fontWeight.semibold,
  },
});
