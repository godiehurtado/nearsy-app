import React from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { screenPadding } from '../../theme/spacing';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  footer?: React.ReactNode;
}

/** Safe-area shell for the registration wizard (nearsy-rn-v3 ScreenLayout). */
export function RegistrationLayout({ children, style, footer }: Props) {
  const { palette } = useAppTheme();

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.body, style]}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  body: {
    flex: 1,
    paddingHorizontal: screenPadding.horizontal,
    paddingTop: screenPadding.top,
  },
  footer: {
    paddingHorizontal: screenPadding.horizontal,
    paddingBottom: screenPadding.bottom,
  },
});
