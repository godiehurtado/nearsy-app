/**
 * Professional industry field (CRJ details and Own Profile, professional mode
 * only). Shows the current value and opens the picker; the caller saves.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { industryIconFor, industryLabel, industryLang } from '../../industries/industryCatalog.ts';
import { IndustryPickerModal } from './IndustryPickerModal';

type Props = {
  label: string;
  /** Catalog id, or null for "Not specified" (absent reads the same). */
  value: string | null;
  onChange: (id: string | null) => void;
  editable?: boolean;
  saving?: boolean;
  hint?: string;
};

export function IndustrySelectField({ label, value, onChange, editable = true, saving = false, hint }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppTheme();
  const [open, setOpen] = useState(false);
  const shown = value ? industryLabel(value, industryLang(i18n.language)) : null;

  return (
    <View style={styles.wrap}>
      <Text accessibilityLabel={label} style={[styles.label, { color: palette.textMuted }]}>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={!editable || saving}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown ?? t('profile.industry.unspecified')}`}
        accessibilityHint={t('profile.industry.openHint')}
        accessibilityState={{ disabled: !editable || saving, busy: saving }}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: palette.surface, borderColor: palette.borderStrong },
          pressed && { backgroundColor: palette.panel },
        ]}
      >
        <MaterialCommunityIcons
          name={(value ? industryIconFor(value) : 'briefcase-outline') as never}
          size={20}
          color={value ? palette.textSecondary : palette.textMuted}
          style={styles.icon}
        />
        <Text
          style={[styles.value, { color: shown ? palette.textPrimary : palette.textMuted }]}
          numberOfLines={2}
        >
          {shown ?? t('profile.industry.unspecified')}
        </Text>
        {saving ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : editable ? (
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        ) : null}
      </Pressable>
      {hint ? <Text style={[styles.hint, { color: palette.textMuted }]}>{hint}</Text> : null}
      <IndustryPickerModal
        visible={open}
        selectedId={value}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          setOpen(false);
          if (id !== value) onChange(id);
        }}
      />
    </View>
  );
}

// Same label and box as FormInput, so the field reads as one of the form's own.
const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 7,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  icon: { marginRight: spacing.sm },
  value: { flex: 1, fontSize: fontSize.md },
  hint: { fontSize: fontSize.xs, marginTop: 6 },
});
