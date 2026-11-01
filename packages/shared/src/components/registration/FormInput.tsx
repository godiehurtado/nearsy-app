import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  Pressable,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { radius } from '../../theme/radius.ts';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { useTranslation } from '../../i18n/index.ts';

interface Props extends TextInputProps {
  label?: string;
  errorText?: string;
  /** Password field: hidden by default, with show/hide control. */
  passwordToggle?: boolean;
}

/** Themed form input (nearsy-rn-v3 TextField). */
export function FormInput({
  label,
  errorText,
  style,
  passwordToggle = false,
  secureTextEntry,
  onSelectionChange,
  ...inputProps
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [selection, setSelection] = useState<
    { start: number; end: number } | undefined
  >(undefined);
  const selectionRef = useRef<{ start: number; end: number } | undefined>(
    undefined,
  );
  const hasError = !!errorText;
  const hidden = passwordToggle ? !passwordVisible : !!secureTextEntry;

  const handleSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => {
    selectionRef.current = event.nativeEvent.selection;
    if (selection) {
      setSelection(undefined);
    }
    onSelectionChange?.(event);
  };

  const togglePasswordVisibility = () => {
    const nextSelection = selectionRef.current;
    setPasswordVisible((prev) => !prev);
    if (nextSelection) {
      requestAnimationFrame(() => {
        setSelection(nextSelection);
      });
    }
  };

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text
          accessibilityLabel={label}
          style={[styles.label, { color: palette.textMuted }]}
        >
          {label}
        </Text>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={palette.placeholder}
          {...inputProps}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          secureTextEntry={hidden}
          onSelectionChange={handleSelectionChange}
          selection={selection}
          style={[
            styles.input,
            passwordToggle ? styles.inputWithToggle : null,
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
        />
        {passwordToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible
                ? t('authentication.password.hide')
                : t('authentication.password.show')
            }
            accessibilityState={{ selected: passwordVisible }}
            hitSlop={8}
            onPress={togglePasswordVisibility}
            style={styles.eyeButton}
          >
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
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
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: fontSize.xs,
    marginTop: 6,
    fontWeight: fontWeight.semibold,
  },
});
