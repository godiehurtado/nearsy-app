/**
 * Searchable single-country selector (CRJ + Edit Profile).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  buildCountrySearchEntries,
  findCountryEntry,
  searchCountryEntries,
  type CountrySearchEntry,
} from '../../profileContext/countryCatalog';

type Props = {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  value: string | null;
  locale: string;
  editable?: boolean;
  onChange: (code: string | null) => void;
};

const BLUR_HIDE_MS = 180;

export function CountrySelectField({
  label,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  value,
  locale,
  editable = true,
  onChange,
}: Props) {
  const { palette } = useAppTheme();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const blurHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurHideTimer.current) clearTimeout(blurHideTimer.current);
    };
  }, []);

  const catalog = useMemo(
    () => buildCountrySearchEntries(locale),
    [locale],
  );

  const selected = useMemo(
    () => findCountryEntry(catalog, value),
    [catalog, value],
  );

  const results = useMemo(
    () => searchCountryEntries(catalog, query).slice(0, 40),
    [catalog, query],
  );

  const showResults = focused && query.trim().length > 0;

  const clearBlurHideTimer = () => {
    if (blurHideTimer.current) {
      clearTimeout(blurHideTimer.current);
      blurHideTimer.current = null;
    }
  };

  const handleSelect = (entry: CountrySearchEntry) => {
    selectingRef.current = true;
    clearBlurHideTimer();
    onChange(entry.code);
    setQuery('');
    setFocused(false);
    Keyboard.dismiss();
    selectingRef.current = false;
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.textSecondary }]}>
        {label}
      </Text>
      {selected ? (
        <View
          style={[
            styles.selectedRow,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={styles.flag}>{selected.flag}</Text>
          <Text
            style={[styles.selectedLabel, { color: palette.textPrimary }]}
            numberOfLines={1}
          >
            {selected.label}
          </Text>
          {editable ? (
            <Pressable
              onPress={() => onChange(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={emptyLabel}
            >
              <Ionicons name="close-circle" size={20} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {editable && !selected ? (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder || placeholder}
            placeholderTextColor={palette.textMuted}
            editable={editable}
            onFocus={() => {
              clearBlurHideTimer();
              setFocused(true);
            }}
            onBlur={() => {
              blurHideTimer.current = setTimeout(() => {
                if (!selectingRef.current) setFocused(false);
              }, BLUR_HIDE_MS);
            }}
            style={[
              styles.input,
              {
                color: palette.textPrimary,
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {showResults ? (
            <View
              style={[
                styles.results,
                {
                  backgroundColor: palette.panel,
                  borderColor: palette.border,
                },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.resultsScroll}
              >
                {results.length === 0 ? (
                  <Text
                    style={[styles.empty, { color: palette.textMuted }]}
                  >
                    {emptyLabel}
                  </Text>
                ) : (
                  results.map((entry) => (
                    <Pressable
                      key={entry.code}
                      onPress={() => handleSelect(entry)}
                      style={styles.resultRow}
                      accessibilityRole="button"
                    >
                      <Text style={styles.flag}>{entry.flag}</Text>
                      <Text
                        style={[
                          styles.resultLabel,
                          { color: palette.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  selectedLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  flag: {
    fontSize: 20,
  },
  results: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    maxHeight: 220,
    overflow: 'hidden',
  },
  resultsScroll: {
    maxHeight: 220,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultLabel: {
    flex: 1,
    fontSize: fontSize.md,
  },
  empty: {
    padding: spacing.md,
    fontSize: fontSize.sm,
  },
});
