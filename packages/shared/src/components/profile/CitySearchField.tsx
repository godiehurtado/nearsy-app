/**
 * Optional current-city picker (CountrySearchField-aligned).
 * Only a suggestion with a stable provider id can be selected; free text is
 * never saved. Search failures keep the field optional.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import {
  countryCodeToFlagEmoji,
  getCountryDisplayName,
} from '../../profile/countryCatalog';
import {
  createCitySearchController,
  type CitySearchController,
  type CitySearchFn,
  type CitySearchState,
} from '../../profile/citySearchController';
import { searchCitiesRemote } from '../../profile/citySearchRuntime';
import {
  currentCityKey,
  formatCurrentCityPlace,
  resolvePreferredCityCountryCode,
  type CurrentCity,
} from '../../profile/currentCity';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';

export type CitySearchFieldProps = {
  value: CurrentCity | null;
  onChange: (city: CurrentCity | null) => void;
  label: string;
  placeholder: string;
  disabled?: boolean;
  search?: CitySearchFn;
};

export function CitySearchField({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  search = searchCitiesRemote,
}: CitySearchFieldProps) {
  const { palette } = useAppTheme();
  const { i18n, t } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = i18n.language || 'en';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<CitySearchState>({
    status: 'idle',
    query: '',
  });
  const controllerRef = useRef<CitySearchController | null>(null);

  const placeOf = useCallback(
    (city: CurrentCity) =>
      formatCurrentCityPlace(city, getCountryDisplayName(city.countryCode, locale)),
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
    if (disabled) return;
    setQuery('');
    setState({ status: 'idle', query: '' });
    setOpen(true);
  }, [disabled]);

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

  const clearSelection = useCallback(() => {
    if (disabled) return;
    onChange(null);
  }, [disabled, onChange]);

  const optionalLabel = t('profile.context.optional');
  const fieldA11y = [label, optionalLabel, selectedPlace]
    .filter(Boolean)
    .join(', ');

  const listData =
    state.status === 'results' || state.status === 'suggestions'
      ? state.results
      : [];

  let statusMessage: string | null = null;
  if (state.status === 'idle') statusMessage = t('profile.context.cityMinChars');
  if (state.status === 'empty') statusMessage = t('profile.context.noCityResults');
  if (state.status === 'error') statusMessage = t('profile.context.citySearchError');

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
        <Text style={[styles.optional, { color: palette.textMuted }]}>
          {optionalLabel}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fieldA11y}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={openModal}
        style={[
          styles.field,
          {
            borderColor: open ? palette.primary : palette.borderStrong,
            backgroundColor: palette.surface,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <View style={styles.fieldContent}>
          {value && selectedPlace ? (
            <>
              <Text style={styles.flag}>
                {countryCodeToFlagEmoji(value.countryCode)}
              </Text>
              <Text
                style={[styles.valueText, { color: palette.textPrimary }]}
                numberOfLines={1}
              >
                {selectedPlace}
              </Text>
            </>
          ) : (
            <Text
              style={[styles.placeholderText, { color: palette.placeholder }]}
              numberOfLines={1}
            >
              {placeholder}
            </Text>
          )}
        </View>

        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.context.clearCityA11y')}
            disabled={disabled}
            onPress={clearSelection}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={20} color={palette.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="search" size={18} color={palette.textMuted} />
        )}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: palette.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.modalHeader,
              {
                paddingTop: Math.max(insets.top, spacing.lg),
                borderBottomColor: palette.border,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.buttons.close')}
              onPress={closeModal}
              hitSlop={8}
            >
              <Text
                style={{
                  color: palette.textSecondary,
                  fontWeight: fontWeight.semibold,
                }}
              >
                {t('common.buttons.close')}
              </Text>
            </Pressable>
            <Text
              style={[styles.modalTitle, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={onQueryChange}
              placeholder={t('profile.context.searchCity')}
              placeholderTextColor={palette.placeholder}
              autoFocus
              autoCorrect={false}
              autoCapitalize="words"
              clearButtonMode="while-editing"
              style={[
                styles.searchInput,
                {
                  color: palette.textPrimary,
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.surface,
                },
              ]}
              accessibilityLabel={t('profile.context.searchCity')}
            />
          </View>

          {state.status === 'loading' ? (
            <View style={styles.statusRow} accessibilityLiveRegion="polite">
              <ActivityIndicator color={palette.primary} />
              <Text style={[styles.statusText, { color: palette.textSecondary }]}>
                {t('profile.context.citySearching')}
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

          {state.status === 'suggestions' ? (
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>
              {t('profile.context.suggestedCities')}
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
                getCountryDisplayName(item.countryCode, locale),
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={placeOf(item)}
                  onPress={() => selectCity(item)}
                  style={[
                    styles.optionRow,
                    selected && { backgroundColor: palette.chipBg },
                  ]}
                >
                  <Text style={styles.flag}>
                    {countryCodeToFlagEmoji(item.countryCode)}
                  </Text>
                  <View style={styles.optionText}>
                    <Text
                      style={[styles.optionName, { color: palette.textPrimary }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={[
                        styles.optionDetail,
                        { color: palette.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {detail}
                    </Text>
                  </View>
                  {selected ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={palette.primary}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: 7,
  },
  label: {
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
    width: '100%',
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  flag: {
    fontSize: 18,
  },
  valueText: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  placeholderText: {
    flex: 1,
    fontSize: fontSize.md,
  },
  clearBtn: {
    padding: 2,
  },
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {
    width: 48,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchInput: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
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
    paddingVertical: 12,
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
