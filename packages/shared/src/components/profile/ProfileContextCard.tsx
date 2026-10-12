/**
 * Read-only profile context card for Discovery Profile.
 * Country of origin + current city + languages; omits missing rows and
 * returns null when empty.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { InterestChip } from '../InterestChip';
import { useTranslation } from '../../i18n';
import {
  countryCodeToFlagEmoji,
  getCountryDisplayName,
} from '../../profile/countryCatalog';
import {
  formatCurrentCityPlace,
  parseCurrentCity,
  type CurrentCity,
} from '../../profile/currentCity';
import { getLanguageDisplayName } from '../../profile/languageCatalog';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';

export type ProfileContextCardProps = {
  birthCountryCode?: string | null;
  currentCity?: CurrentCity | null;
  languageCodes?: readonly string[] | null;
  /** BCP-47 / app language; defaults to i18n.language. */
  locale?: string;
};

export function ProfileContextCard({
  birthCountryCode,
  currentCity,
  languageCodes,
  locale: localeProp,
}: ProfileContextCardProps) {
  const { palette } = useAppTheme();
  const { t, i18n } = useTranslation();
  const locale = localeProp || i18n.language || 'en';

  const birthCode =
    typeof birthCountryCode === 'string' && birthCountryCode.trim()
      ? birthCountryCode.trim().toUpperCase()
      : null;
  const city = parseCurrentCity(currentCity);

  const languages = useMemo(() => {
    if (!Array.isArray(languageCodes)) return [];
    return languageCodes
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .map((code) => ({
        code,
        name: getLanguageDisplayName(code, locale),
      }));
  }, [languageCodes, locale]);

  const birthRow = birthCode
    ? {
        flag: countryCodeToFlagEmoji(birthCode),
        name: getCountryDisplayName(birthCode, locale),
      }
    : null;
  const cityRow = city
    ? {
        flag: countryCodeToFlagEmoji(city.countryCode),
        place: formatCurrentCityPlace(
          city,
          getCountryDisplayName(city.countryCode, locale),
        ),
      }
    : null;

  if (!birthRow && !cityRow && languages.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.panel,
          borderColor: palette.border,
        },
        cardShadow,
      ]}
      accessibilityRole="summary"
    >
      {birthRow ? (
        <Text
          style={[styles.row, { color: palette.textPrimary }]}
          numberOfLines={2}
        >
          {t('discoveryProfile.from', {
            flag: birthRow.flag,
            country: birthRow.name,
          })}
        </Text>
      ) : null}

      {cityRow ? (
        <Text
          style={[
            styles.row,
            {
              color: palette.textPrimary,
              marginTop: birthRow ? spacing.xs : 0,
            },
          ]}
          numberOfLines={2}
        >
          {t('discoveryProfile.livesIn', {
            flag: cityRow.flag,
            place: cityRow.place,
          })}
        </Text>
      ) : null}

      {languages.length > 0 ? (
        <View
          style={{
            marginTop: birthRow || cityRow ? spacing.md : 0,
          }}
        >
          <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
            {t('discoveryProfile.languages')}
          </Text>
          <View style={styles.chipsRow}>
            {languages.map((lang) => (
              <InterestChip key={lang.code} name={lang.name} selected={false} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  row: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
