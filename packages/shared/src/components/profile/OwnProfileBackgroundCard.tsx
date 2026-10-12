import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CountrySelectField } from '../profileContext/CountrySelectField';
import { CurrentCityField } from '../profileContext/CurrentCityField';
import { LanguageMultiSelectField } from '../profileContext/LanguageMultiSelectField';
import type { CurrentCity } from '../../profileContext/currentCity';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';

export type OwnProfileBackgroundValues = {
  birthCountryCode: string | null;
  currentCity: CurrentCity | null;
  languageCodes: string[];
};

export type OwnProfileBackgroundLabels = {
  sectionTitle: string;
  birthCountry: string;
  currentCity: string;
  languages: string;
};

export type OwnProfileBackgroundPlaceholders = {
  birthCountrySearch: string;
  currentCitySearch: string;
  languagesSearch: string;
  countrySearchEmpty: string;
  countryClear: string;
  languagesEmpty: string;
  languagesLimit: string;
};

type Props = {
  values: OwnProfileBackgroundValues;
  labels: OwnProfileBackgroundLabels;
  placeholders: OwnProfileBackgroundPlaceholders;
  locale: string;
  editable: boolean;
  onChangeBirthCountry: (value: string | null) => void;
  onChangeCurrentCity: (value: CurrentCity | null) => void;
  onChangeLanguages: (codes: string[]) => void;
};

/** Origin, the city where the user lives today (optional), and languages. */
export default function OwnProfileBackgroundCard({
  values,
  labels,
  placeholders,
  locale,
  editable,
  onChangeBirthCountry,
  onChangeCurrentCity,
  onChangeLanguages,
}: Props) {
  const { palette } = useAppTheme();

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
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, { color: palette.textPrimary }]}
      >
        {labels.sectionTitle}
      </Text>

      <View>
        <CountrySelectField
          label={labels.birthCountry}
          uppercaseLabel
          placeholder={placeholders.birthCountrySearch}
          searchPlaceholder={placeholders.birthCountrySearch}
          emptyLabel={placeholders.countrySearchEmpty}
          clearLabel={placeholders.countryClear}
          value={values.birthCountryCode}
          locale={locale}
          editable={editable}
          onChange={onChangeBirthCountry}
        />
        <CurrentCityField
          label={labels.currentCity}
          uppercaseLabel
          placeholder={placeholders.currentCitySearch}
          value={values.currentCity}
          locale={locale}
          editable={editable}
          onChange={onChangeCurrentCity}
        />
        <LanguageMultiSelectField
          label={labels.languages}
          uppercaseLabel
          searchPlaceholder={placeholders.languagesSearch}
          emptyLabel={placeholders.languagesEmpty}
          limitMessage={placeholders.languagesLimit}
          selectedCodes={values.languageCodes}
          locale={locale}
          editable={editable}
          onChange={onChangeLanguages}
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
});
