/**
 * Multi-select languages field with searchable catalog and wrapped chips.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { InterestChip } from '../InterestChip';
import { useTranslation } from '../../i18n';
import {
  filterLanguages,
  getLanguageDisplayName,
  MAX_PROFILE_LANGUAGES,
} from '../../profile/languageCatalog';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';

export type LanguageMultiSelectFieldProps = {
  value: string[];
  onChange: (codes: string[]) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  maxLanguages?: number;
  disabled?: boolean;
};

export function LanguageMultiSelectField({
  value,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  maxLanguages = MAX_PROFILE_LANGUAGES,
  disabled = false,
}: LanguageMultiSelectFieldProps) {
  const { palette } = useAppTheme();
  const { i18n, t } = useTranslation();
  const locale = i18n.language || 'en';

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const selected = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  );

  const atMax = selected.length >= maxLanguages;

  const selectedChips = useMemo(
    () =>
      selected.map((code) => ({
        code,
        name: getLanguageDisplayName(code, locale),
      })),
    [locale, selected],
  );

  const results = useMemo(() => {
    const rows = filterLanguages(query, locale, selected);
    return rows.slice(0, 40);
  }, [locale, query, selected]);

  const removeLanguage = useCallback(
    (code: string) => {
      if (disabled) return;
      onChange(selected.filter((c) => c !== code));
    },
    [disabled, onChange, selected],
  );

  const addLanguage = useCallback(
    (code: string) => {
      if (disabled || atMax) return;
      if (selected.includes(code)) return;
      onChange([...selected, code]);
      setQuery('');
    },
    [atMax, disabled, onChange, selected],
  );

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>

      {selectedChips.length > 0 ? (
        <View style={styles.chipsRow}>
          {selectedChips.map((chip) => (
            <InterestChip
              key={chip.code}
              name={chip.name}
              selected
              accessibilityLabel={t('profile.context.removeLanguageA11y', {
                language: chip.name,
              })}
              onPress={disabled ? undefined : () => removeLanguage(chip.code)}
            />
          ))}
        </View>
      ) : (
        <Text
          style={[styles.emptyHint, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {placeholder}
        </Text>
      )}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={palette.placeholder}
        editable={!disabled}
        autoCorrect={false}
        autoCapitalize="none"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.searchInput,
          {
            color: palette.textPrimary,
            borderColor: focused ? palette.primary : palette.borderStrong,
            backgroundColor: palette.surface,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
        accessibilityLabel={searchPlaceholder}
      />

      {atMax ? (
        <Text style={[styles.maxHint, { color: palette.textMuted }]}>
          {t('profile.context.maxLanguages', { count: maxLanguages })}
        </Text>
      ) : null}

      {!atMax && query.trim().length > 0 ? (
        <View
          style={[
            styles.resultsCard,
            {
              backgroundColor: palette.panel,
              borderColor: palette.border,
            },
          ]}
        >
          {results.length === 0 ? (
            <Text style={[styles.noResults, { color: palette.textMuted }]}>
              {t('profile.context.noLanguageResults')}
            </Text>
          ) : (
            results.map((item) => (
              <Pressable
                key={item.code}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                disabled={disabled}
                onPress={() => addLanguage(item.code)}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && { backgroundColor: palette.chipBg },
                ]}
              >
                <Text
                  style={[styles.optionName, { color: palette.textPrimary }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: spacing.sm },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 1,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emptyHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  searchInput: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    fontSize: fontSize.md,
  },
  maxHint: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  resultsCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  optionRow: {
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
  },
  optionName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  noResults: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.sm,
  },
});
