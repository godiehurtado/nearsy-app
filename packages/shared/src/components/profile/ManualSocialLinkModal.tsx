import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
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
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.title, { color: palette.textPrimary }]}>
            {t('profile.social.manual.title', { platform: platformLabel })}
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
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
              <Text style={{ color: palette.textPrimary, fontWeight: fontWeight.bold }}>
                {t('profile.social.manual.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onSave(value)}
              disabled={saving}
              style={[
                styles.action,
                { backgroundColor: palette.primary, borderColor: palette.primary },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: fontWeight.bold }}>
                {saving
                  ? t('profile.social.saving')
                  : t('profile.social.manual.saveLink')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.extrabold,
  },
  body: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSize.md,
  },
  error: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  hint: {
    fontSize: fontSize.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
