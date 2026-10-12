/**
 * Optional current-city picker (CRJ + Edit Profile).
 * Only a suggestion with a stable provider id can be selected; typed text is
 * never saved. Search failures show a retry and keep the field optional.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import {
  countryDisplayName,
  countryFlagEmoji,
} from '../../profileContext/countryCatalog';
import {
  createCitySearchController,
  type CitySearchController,
  type CitySearchFn,
  type CitySearchState,
} from '../../profileContext/citySearchController';
import { searchCitiesRemote } from '../../profileContext/citySearchRuntime';
import {
  CITY_SEARCH_MAX_QUERY,
  currentCityKey,
  formatCurrentCityPlace,
  resolvePreferredCityCountryCode,
  type CurrentCity,
} from '../../profileContext/currentCity';

type Props = {
  label: string;
  /** Form-style caps label; the accessible name stays in natural case. */
  uppercaseLabel?: boolean;
  placeholder: string;
  value: CurrentCity | null;
  locale: string;
  editable?: boolean;
  onChange: (city: CurrentCity | null) => void;
  search?: CitySearchFn;
};

export function CurrentCityField({
  label,
  uppercaseLabel = false,
  placeholder,
  value,
  locale,
  editable = true,
  onChange,
  search = searchCitiesRemote,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<CitySearchState>({
    status: 'idle',
    query: '',
  });
  const controllerRef = useRef<CitySearchController | null>(null);

  const placeOf = useCallback(
    (city: CurrentCity) =>
      formatCurrentCityPlace(city, countryDisplayName(city.countryCode, locale)),
    [locale],
  );

  const selectedPlace = useMemo(
    () => (value ? placeOf(value) : null),
    [placeOf, value],
  );

  useEffect(() => {
    if (!open) return undefined;
    const controller = createCitySearchController({
      search,
      onChange: setState,
    });
    controllerRef.current = controller;
    controller.open(resolvePreferredCityCountryCode(Localization.getLocales()));
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [open, search]);

  const openModal = useCallback(() => {
    if (!editable) return;
    setQuery('');
    setState({ status: 'idle', query: '' });
    setOpen(true);
  }, [editable]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const onQueryChange = useCallback((next: string) => {
    setQuery(next);
    controllerRef.current?.setQuery(next);
  }, []);

  const selectCity = useCallback(
    (city: CurrentCity) => {
      onChange(city);
      closeModal();
    },
    [closeModal, onChange],
  );

  const onRetry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  const optionalLabel = t('profile.city.optional');
  const fieldA11y = [label, optionalLabel, selectedPlace ?? placeholder]
    .filter(Boolean)
    .join(', ');

  const listData =
    state.status === 'results' || state.status === 'suggestions'
      ? state.results
      : [];

  let statusMessage: string | null = null;
  if (state.status === 'idle') statusMessage = t('profile.city.typeToSearch');
  if (state.status === 'empty') statusMessage = t('profile.city.noResults');
  if (state.status === 'error') {
    statusMessage =
      state.reason === 'rate-limited'
        ? t('profile.city.rateLimited')
        : t('profile.city.unavailable');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text
          accessibilityLabel={label}
          style={
            uppercaseLabel
              ? [styles.labelCaps, { color: palette.textMuted }]
              : [styles.label, { color: palette.textSecondary }]
          }
        >
          {label}
        </Text>
        <Text style={[styles.optional, { color: palette.textMuted }]}>
          {optionalLabel}
        </Text>
      </View>

      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.surface,
            borderColor: open ? palette.primary : palette.border,
            opacity: editable ? 1 : 0.6,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fieldA11y}
          accessibilityState={{ disabled: !editable }}
          disabled={!editable}
          onPress={openModal}
          style={styles.fieldContent}
        >
          {value && selectedPlace ? (
            <>
              <Text
                style={styles.flag}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                {countryFlagEmoji(value.countryCode)}
              </Text>
              <Text style={[styles.valueText, { color: palette.textPrimary }]}>
                {selectedPlace}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="search" size={18} color={palette.textMuted} />
              <Text style={[styles.placeholderText, { color: palette.textMuted }]}>
                {placeholder}
              </Text>
            </>
          )}
        </Pressable>
        {value && editable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.city.clearA11y')}
            onPress={() => onChange(null)}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={22} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View
          style={[
            styles.modalRoot,
            {
              backgroundColor: palette.background,
              paddingTop: insets.top,
            },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.city.close')}
              onPress={closeModal}
              hitSlop={8}
              style={styles.headerButton}
            >
              <Text style={[styles.headerButtonText, { color: palette.primary }]}>
                {t('profile.city.close')}
              </Text>
            </Pressable>
            <Text
              accessibilityRole="header"
              style={[styles.modalTitle, { color: palette.textPrimary }]}
            >
              {label}
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              placeholder={t('profile.city.searchCity')}
              placeholderTextColor={palette.textMuted}
              accessibilityLabel={t('profile.city.searchCity')}
              autoFocus
              maxLength={CITY_SEARCH_MAX_QUERY}
              autoCorrect={false}
              autoCapitalize="words"
              style={[
                styles.input,
                {
                  color: palette.textPrimary,
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            />
          </View>

          {state.status === 'loading' ? (
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <ActivityIndicator color={palette.primary} />
              <Text style={[styles.statusText, { color: palette.textSecondary }]}>
                {t('profile.city.searching')}
              </Text>
            </View>
          ) : null}

          {statusMessage ? (
            <Text
              style={[
                styles.statusText,
                styles.statusMessage,
                { color: palette.textSecondary },
              ]}
              accessibilityLiveRegion="polite"
            >
              {statusMessage}
            </Text>
          ) : null}

          {state.status === 'error' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('profile.city.retry')}
              onPress={onRetry}
              style={({ pressed }) => [
                styles.retryBtn,
                { borderColor: palette.primary, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.retryText, { color: palette.primary }]}>
                {t('profile.city.retry')}
              </Text>
            </Pressable>
          ) : null}

          {state.status === 'suggestions' ? (
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
              {t('profile.city.suggested')}
            </Text>
          ) : null}

          <FlatList
            data={listData}
            keyExtractor={currentCityKey}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + spacing.xl,
            }}
            renderItem={({ item }) => {
              const selected =
                value != null && currentCityKey(value) === currentCityKey(item);
              const detail = [
                item.region,
                countryDisplayName(item.countryCode, locale),
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={placeOf(item)}
                  onPress={() => selectCity(item)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    (selected || pressed) && { backgroundColor: palette.chipBg },
                  ]}
                >
                  <Text
                    style={styles.flag}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    {countryFlagEmoji(item.countryCode)}
                  </Text>
                  <View style={styles.optionText}>
                    <Text style={[styles.optionName, { color: palette.textPrimary }]}>
                      {item.name}
                    </Text>
                    <Text
                      style={[styles.optionDetail, { color: palette.textSecondary }]}
                    >
                      {detail}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={palette.primary}
                      accessibilityLabel={t('profile.city.selectedA11y')}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: 7,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  labelCaps: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  optional: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    minWidth: 0,
  },
  flag: {
    fontSize: 20,
  },
  valueText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  placeholderText: {
    flex: 1,
    fontSize: fontSize.md,
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  headerButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  modalTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
  },
  statusMessage: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  optionDetail: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
