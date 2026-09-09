/**
 * Shared Own Profile editor chrome — Nearsy 2.0 / CRJ presentation.
 * Replaces legacy TopHeader + guide-audio shells on post-CRJ editors.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RegistrationLayout } from './RegistrationLayout.tsx';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';

type Props = {
  title: string;
  eyebrow?: string;
  body?: string;
  onBack: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
  contentScrollRef?: React.RefObject<ScrollView | null>;
};

export function OwnProfileEditorShell({
  title,
  eyebrow,
  body,
  onBack,
  children,
  footer,
  scroll = true,
  scrollProps,
  contentScrollRef,
}: Props) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={styles.backBtn}
      >
        <Ionicons name="chevron-back" size={24} color={palette.textPrimary} />
      </Pressable>
      <View style={styles.headerText}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, { color: palette.chipText }]}>
            {eyebrow}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: palette.textPrimary }]}>{title}</Text>
        {body ? (
          <Text style={[styles.body, { color: palette.textSecondary }]}>{body}</Text>
        ) : null}
      </View>
    </View>
  );

  const content = scroll ? (
    <ScrollView
      ref={contentScrollRef}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: Math.max(insets.bottom, 24) + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...scrollProps}
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={styles.flex}>
      {header}
      <View style={styles.flex}>{children}</View>
    </View>
  );

  return <RegistrationLayout footer={footer}>{content}</RegistrationLayout>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerText: { flex: 1, paddingTop: 4 },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
