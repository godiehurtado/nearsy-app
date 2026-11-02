import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { radius } from '../../theme/radius';
import { spacing } from '../../theme/spacing';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busy?: boolean;
  glyph?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function OwnershipExplainModal({
  visible,
  title,
  body,
  confirmLabel,
  busy = false,
  glyph,
  onCancel,
  onConfirm,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();

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
                {title}
              </Text>
            </View>
            <Text
              style={[styles.body, { color: palette.textSecondary }]}
              maxFontSizeMultiplier={1.5}
            >
              {body}
            </Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={onCancel}
                disabled={busy}
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
                onPress={onConfirm}
                disabled={busy}
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
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
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
