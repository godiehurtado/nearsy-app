import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { FormInput } from './FormInput';
import { useTranslation } from '../../i18n';
import {
  CUSTOM_INTEREST_MAX_LENGTH,
  ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS,
  resolveCustomInterestIconColor,
} from '../../interests/onboardingInterestCatalog';

type Props = {
  customName: string;
  customIcon: string | null;
  customError: string | null;
  onChangeName: (value: string) => void;
  onSelectIcon: (icon: string, iconColor: string) => void;
  onAdd: () => void;
  onCancel: () => void;
};

export function OnboardingInterestCustomComposer({
  customName,
  customIcon,
  customError,
  onChangeName,
  onSelectIcon,
  onAdd,
  onCancel,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const previewColor = customIcon
    ? resolveCustomInterestIconColor(customIcon)
    : palette.textMuted;

  return (
    <View
      style={[
        styles.composer,
        { borderColor: palette.accentBorder, backgroundColor: palette.panel },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.composerTitle, { color: palette.textPrimary }]}>
          {t('onboarding.profileCompletion.interests.custom.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          hitSlop={8}
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: palette.primary, fontWeight: fontWeight.bold }}>
            {t('onboarding.profileCompletion.interests.custom.cancel')}
          </Text>
        </Pressable>
      </View>

      {customIcon ? (
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewIcon,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Ionicons
              name={customIcon as any}
              size={20}
              color={previewColor}
            />
          </View>
          <Text style={[styles.previewHint, { color: palette.textMuted }]}>
            {t('onboarding.profileCompletion.interests.custom.previewHint')}
          </Text>
        </View>
      ) : null}

      <FormInput
        label={t('onboarding.profileCompletion.interests.custom.nameLabel')}
        placeholder={t(
          'onboarding.profileCompletion.interests.custom.namePlaceholder',
        )}
        value={customName}
        onChangeText={onChangeName}
        maxLength={CUSTOM_INTEREST_MAX_LENGTH}
        autoCapitalize="words"
      />
      <Text style={[styles.iconLabel, { color: palette.textMuted }]}>
        {t('onboarding.profileCompletion.interests.custom.iconLabel')}
      </Text>
      <View style={styles.iconGrid}>
        {ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS.map(({ icon, iconColor }) => {
          const active = customIcon === icon;
          return (
            <Pressable
              key={icon}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={icon}
              onPress={() => onSelectIcon(icon, iconColor)}
              style={[
                styles.iconCell,
                {
                  borderColor: active ? palette.primary : palette.border,
                  backgroundColor: active ? palette.chipBg : palette.surface,
                },
              ]}
            >
              <Ionicons name={icon as any} size={22} color={iconColor} />
            </Pressable>
          );
        })}
      </View>
      {customError ? (
        <Text style={{ color: palette.danger, marginTop: spacing.sm }}>
          {customError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        style={[styles.addBtn, { backgroundColor: palette.primary }]}
      >
        <Text style={styles.addBtnText}>
          {t('onboarding.profileCompletion.interests.custom.add')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  composerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHint: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  iconLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
});
