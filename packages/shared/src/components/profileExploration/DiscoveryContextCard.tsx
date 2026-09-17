/**
 * Public profile context card — birth/residence countries + languages.
 * Omits missing rows; omits entire card when all context empty.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n';
import {
  countryDisplayName,
  countryFlagEmoji,
  normalizeCountryCode,
} from '../../profileContext/countryCatalog';
import {
  languageDisplayName,
  normalizeLanguageCodes,
} from '../../profileContext/languageCatalog';
import { hasAnyDiscoveryContext } from '../../profileContext/profileContextFields';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';
import { cardShadow } from '../../theme/shadows';

type Props = {
  birthCountryCode: string | null;
  residenceCountryCode: string | null;
  languageCodes: readonly string[];
  locale: string;
};

export function DiscoveryContextCard({
  birthCountryCode,
  residenceCountryCode,
  languageCodes,
  locale,
}: Props) {
  const { palette } = useAppTheme();
  const { t, i18n } = useTranslation();
  const resolvedLocale = locale || i18n.language || 'en';

  const birth = normalizeCountryCode(birthCountryCode);
  const residence = normalizeCountryCode(residenceCountryCode);
  const languages = normalizeLanguageCodes(languageCodes);

  const show = hasAnyDiscoveryContext({
    birthCountryCode: birth,
    residenceCountryCode: residence,
    languageCodes: languages,
  });

  const languageLabels = useMemo(() => {
    return languages.map((code) => ({
      code,
      label: languageDisplayName(code, resolvedLocale),
    }));
  }, [languages, resolvedLocale]);

  if (!show) {
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
      {birth ? (
        <Text style={[styles.rowText, { color: palette.textPrimary }]}>
          {countryFlagEmoji(birth)}{' '}
          {t('discoveryProfile.context.fromCountry', {
            country: countryDisplayName(birth, resolvedLocale),
          })}
        </Text>
      ) : null}
      {residence ? (
        <Text
          style={[
            styles.rowText,
            {
              color: palette.textPrimary,
              marginTop: birth ? spacing.sm : 0,
            },
          ]}
        >
          {countryFlagEmoji(residence)}{' '}
          {t('discoveryProfile.context.livesInCountry', {
            country: countryDisplayName(residence, resolvedLocale),
          })}
        </Text>
      ) : null}
      {languageLabels.length > 0 ? (
        <>
          <Text
            style={[
              styles.sectionLabel,
              {
                color: palette.textMuted,
                marginTop: birth || residence ? spacing.lg : 0,
              },
            ]}
          >
            {t('discoveryProfile.context.languages')}
          </Text>
          <View style={styles.chips}>
            {languageLabels.map((item) => (
              <View
                key={item.code}
                style={[
                  styles.chip,
                  {
                    backgroundColor: palette.chipBg,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[styles.chipText, { color: palette.textPrimary }]}
                >
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </>
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
  rowText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
