import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CountrySelectField } from '../profileContext/CountrySelectField';
import { LanguageMultiSelectField } from '../profileContext/LanguageMultiSelectField';
import { useAppTheme } from '../../theme/ThemeContext';
import { radius } from '../../theme/radius';
import { spacing, screenPadding } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import { cardShadow } from '../../theme/shadows';

export type OwnProfileBackgroundValues = {
  birthCountryCode: string | null;
  residenceCountryCode: string | null;
  languageCodes: string[];
};

export type OwnProfileBackgroundLabels = {
  sectionTitle: string;
  birthCountry: string;
  residenceCountry: string;
  languages: string;
};

export type OwnProfileBackgroundPlaceholders = {
  birthCountrySearch: string;
  residenceCountrySearch: string;
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
  onChangeResidenceCountry: (value: string | null) => void;
  onChangeLanguages: (codes: string[]) => void;
};

/** Origin, where the user lives today, and languages. */
export default function OwnProfileBackgroundCard({
  values,
  labels,
  placeholders,
  locale,
  editable,
  onChangeBirthCountry,
  onChangeResidenceCountry,
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
        <CountrySelectField
          label={labels.residenceCountry}
          uppercaseLabel
          placeholder={placeholders.residenceCountrySearch}
          searchPlaceholder={placeholders.residenceCountrySearch}
          emptyLabel={placeholders.countrySearchEmpty}
          clearLabel={placeholders.countryClear}
          value={values.residenceCountryCode}
          locale={locale}
          editable={editable}
          onChange={onChangeResidenceCountry}
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
