import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Props = {
  visible: boolean;
  platformLabel: string;
  placeholder: string;
  initialValue: string;
  errorText?: string | null;
  saving?: boolean;
  glyph?: React.ReactNode;
  onCancel: () => void;
  onSave: (value: string) => void;
};

export function ManualSocialLinkModal({
  visible,
  platformLabel,
  placeholder,
  initialValue,
  errorText,
  saving = false,
  glyph,
  onCancel,
  onSave,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('profile.social.manual.cancel')}
          onPress={onCancel}
        />
        <View
          style={[
            styles.card,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            contentContainerStyle={styles.scroll}
          >
            <View style={styles.header}>
              {glyph}
              <Text
                style={[styles.title, { color: palette.textPrimary }]}
                maxFontSizeMultiplier={1.5}
              >
                {t('profile.social.manual.title', { platform: platformLabel })}
              </Text>
            </View>
            <Text
              style={[styles.body, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.5}
            >
              {t('profile.social.manual.body', { platform: platformLabel })}
            </Text>
            <TextInput
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={palette.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType="url"
              textContentType="URL"
              editable={!saving}
              accessibilityLabel={t('profile.social.inputA11y', {
                platform: platformLabel,
              })}
              style={[
                styles.input,
                {
                  color: palette.textPrimary,
                  borderColor: errorText ? palette.danger : palette.borderStrong,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            {errorText ? (
              <Text style={[styles.error, { color: palette.danger }]}>
                {errorText}
              </Text>
            ) : (
              <Text style={[styles.hint, { color: palette.textMuted }]}>
                {t('profile.social.manual.unverifiedHint')}
              </Text>
            )}
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                disabled={saving}
                style={[styles.action, { borderColor: palette.border }]}
              >
                <Text
                  style={{
                    color: palette.textPrimary,
                    fontWeight: fontWeight.bold,
                    fontSize: fontSize.md,
                  }}
                >
                  {t('profile.social.manual.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onSave(value)}
                disabled={saving}
                style={[
                  styles.action,
                  {
                    backgroundColor: palette.primary,
                    borderColor: palette.primary,
                  },
                ]}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: fontWeight.bold,
                    fontSize: fontSize.md,
                  }}
                >
                  {saving
                    ? t('profile.social.saving')
                    : t('profile.social.manual.saveLink')}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSize.md,
  },
  error: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  hint: {
    fontSize: fontSize.sm,
  },
  actions: {
    flexDirection: 'column',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
