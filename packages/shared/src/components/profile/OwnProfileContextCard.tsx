import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { CitySearchField } from './CitySearchField';
import { CountrySearchField } from './CountrySearchField';
import { LanguageMultiSelectField } from './LanguageMultiSelectField';
import type { CurrentCity } from '../../profile/currentCity';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';

export type OwnProfileContextValues = {
  birthCountryCode: string | null;
  currentCity: CurrentCity | null;
  languageCodes: string[];
};

type ContextLabels = {
  sectionTitle: string;
  birthCountry: string;
  currentCity: string;
  languages: string;
};

type ContextPlaceholders = {
  birthCountry: string;
  currentCity: string;
  languages: string;
  searchCountry: string;
  searchLanguage: string;
};

type Props = {
  values: OwnProfileContextValues;
  labels: ContextLabels;
  placeholders: ContextPlaceholders;
  editorWritable: boolean;
  onChangeBirthCountry: (code: string | null) => void;
  onChangeCurrentCity: (city: CurrentCity | null) => void;
  onChangeLanguages: (codes: string[]) => void;
};

export default function OwnProfileContextCard({
  values,
  labels,
  placeholders,
  editorWritable,
  onChangeBirthCountry,
  onChangeCurrentCity,
  onChangeLanguages,
}: Props) {
  const { palette } = useAppTheme();
  const editable = editorWritable;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
        cardShadow,
      ]}
    >
      <Text style={[styles.sectionTitle, { color: palette.textPrimary }]}>
        {labels.sectionTitle}
      </Text>

      <View style={styles.stack}>
        <CountrySearchField
          value={values.birthCountryCode}
          onChange={onChangeBirthCountry}
          label={labels.birthCountry}
          placeholder={placeholders.birthCountry}
          searchPlaceholder={placeholders.searchCountry}
          disabled={!editable}
        />
        <CitySearchField
          value={values.currentCity}
          onChange={onChangeCurrentCity}
          label={labels.currentCity}
          placeholder={placeholders.currentCity}
          disabled={!editable}
        />
        <LanguageMultiSelectField
          value={values.languageCodes}
          onChange={onChangeLanguages}
          label={labels.languages}
          placeholder={placeholders.languages}
          searchPlaceholder={placeholders.searchLanguage}
          disabled={!editable}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: screenPadding.horizontal,
    marginTop: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  stack: {
    gap: spacing.md,
  },
});
