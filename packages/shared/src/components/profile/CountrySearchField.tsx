/**
 * Searchable single-select country control (FormInput-aligned).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../i18n';
import {
  countryCodeToFlagEmoji,
  filterCountries,
  getCountryDisplayName,
} from '../../profile/countryCatalog';
import {
  fontSize,
  fontWeight,
  radius,
  spacing,
  useAppTheme,
} from '../../theme';

export type CountrySearchFieldProps = {
  value: string | null;
  onChange: (code: string | null) => void;
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function CountrySearchField({
  value,
  onChange,
  label,
  placeholder,
  searchPlaceholder,
  disabled = false,
  accessibilityLabel,
}: CountrySearchFieldProps) {
  const { palette } = useAppTheme();
  const { i18n, t } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = i18n.language || 'en';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedName = useMemo(() => {
    if (!value) return null;
    return getCountryDisplayName(value, locale);
  }, [locale, value]);

  const selectedFlag = useMemo(() => {
    if (!value) return null;
    return countryCodeToFlagEmoji(value);
  }, [value]);

  const results = useMemo(
    () => filterCountries(query, locale),
    [locale, query],
  );

  const openModal = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  }, [disabled]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const selectCountry = useCallback(
    (code: string) => {
      onChange(code);
      closeModal();
    },
    [closeModal, onChange],
  );

  const clearSelection = useCallback(() => {
    if (disabled) return;
    onChange(null);
  }, [disabled, onChange]);

  const fieldA11y =
    accessibilityLabel ??
    (selectedName ? `${label}, ${selectedName}` : label);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>

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
          {value && selectedFlag && selectedName ? (
            <>
              <Text style={styles.flag}>{selectedFlag}</Text>
              <Text
                style={[styles.valueText, { color: palette.textPrimary }]}
                numberOfLines={1}
              >
                {selectedName}
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
            accessibilityLabel={t('profile.context.clearCountryA11y')}
            disabled={disabled}
            onPress={clearSelection}
            hitSlop={10}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={20} color={palette.textMuted} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
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
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={palette.placeholder}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              style={[
                styles.searchInput,
                {
                  color: palette.textPrimary,
                  borderColor: palette.borderStrong,
                  backgroundColor: palette.surface,
                },
              ]}
              accessibilityLabel={searchPlaceholder}
            />
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + spacing.xl,
            }}
            renderItem={({ item }) => {
              const selected = item.code === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${item.flag} ${item.name}`}
                  onPress={() => selectCountry(item.code)}
                  style={[
                    styles.optionRow,
                    selected && { backgroundColor: palette.chipBg },
                  ]}
                >
                  <Text style={styles.flag}>{item.flag}</Text>
                  <Text
                    style={[styles.optionName, { color: palette.textPrimary }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
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
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginBottom: 7,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionName: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
});
