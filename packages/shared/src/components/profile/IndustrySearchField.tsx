/**
 * Professional Industry: single, optional selection (Industry contract §0).
 *
 * Modal with search, sector sections, local Ionicons, a check mark and a
 * "Not specified" option that stores null. Search covers EN/ES labels and
 * synonyms (catalog.searchIndustries). No free text, no remote logos.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../i18n';
import {
  industryIonicon,
  industryLabel,
  industryLocale,
  industryPickerSections,
  searchIndustries,
  type Industry,
} from '../../industries/catalog';
import { fontSize, fontWeight, radius, spacing, useAppTheme } from '../../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type IndustrySearchFieldProps = {
  /** Catalog id, or null for "Not specified". */
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

export function IndustrySearchField({
  value,
  onChange,
  disabled = false,
}: IndustrySearchFieldProps) {
  const { palette } = useAppTheme();
  const { i18n, t } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = industryLocale(i18n.language);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const label = t('profile.industry.label');
  const selectedLabel = useMemo(() => industryLabel(value, locale), [locale, value]);
  const sections = useMemo(
    () =>
      industryPickerSections(locale).map((section) => ({
        key: section.sector.id,
        title: section.title,
        data: section.items,
      })),
    [locale],
  );
  const results = useMemo(() => searchIndustries(query, locale), [locale, query]);
  const searching = query.trim().length > 0;

  const openModal = useCallback(() => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  }, [disabled]);

  const closeModal = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const select = useCallback(
    (id: string | null) => {
      onChange(id);
      closeModal();
    },
    [closeModal, onChange],
  );

  const renderOption = (item: Industry) => {
    const selected = item.id === value;
    const name = item.label[locale];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={name}
        onPress={() => select(item.id)}
        style={[styles.optionRow, selected && { backgroundColor: palette.chipBg }]}
      >
        <Ionicons
          name={industryIonicon(item.id) as IoniconName}
          size={20}
          color={palette.textSecondary}
        />
        <Text style={[styles.optionName, { color: palette.textPrimary }]} numberOfLines={2}>
          {name}
        </Text>
        {selected ? <Ionicons name="checkmark" size={18} color={palette.primary} /> : null}
      </Pressable>
    );
  };

  const notSpecified = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: value === null }}
      accessibilityLabel={t('profile.industry.notSpecified')}
      onPress={() => select(null)}
      style={[styles.optionRow, value === null && { backgroundColor: palette.chipBg }]}
    >
      <Ionicons name="remove-circle-outline" size={20} color={palette.textMuted} />
      <Text style={[styles.optionName, { color: palette.textSecondary }]}>
        {t('profile.industry.notSpecified')}
      </Text>
      {value === null ? <Ionicons name="checkmark" size={18} color={palette.primary} /> : null}
    </Pressable>
  );

  const listPadding = {
    paddingHorizontal: spacing.lg,
    paddingBottom: insets.bottom + spacing.xl,
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selectedLabel ?? t('profile.industry.notSpecified')}`}
        accessibilityHint={t('profile.industry.openHint')}
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
        {selectedLabel ? (
          <>
            <Ionicons
              name={industryIonicon(value) as IoniconName}
              size={18}
              color={palette.textSecondary}
            />
            <Text style={[styles.valueText, { color: palette.textPrimary }]} numberOfLines={1}>
              {selectedLabel}
            </Text>
          </>
        ) : (
          <Text style={[styles.placeholderText, { color: palette.placeholder }]} numberOfLines={1}>
            {t('profile.industry.placeholder')}
          </Text>
        )}
        <Ionicons name="chevron-down" size={18} color={palette.textMuted} />
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
              { paddingTop: Math.max(insets.top, spacing.lg), borderBottomColor: palette.border },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.buttons.close')}
              onPress={closeModal}
              hitSlop={8}
            >
              <Text style={{ color: palette.textSecondary, fontWeight: fontWeight.semibold }}>
                {t('common.buttons.close')}
              </Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: palette.textPrimary }]} numberOfLines={1}>
              {label}
            </Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('profile.industry.searchPlaceholder')}
              placeholderTextColor={palette.placeholder}
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
              accessibilityLabel={t('profile.industry.searchPlaceholder')}
            />
          </View>

          {searching ? (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={listPadding}
              renderItem={({ item }) => renderOption(item)}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: palette.textMuted }]}>
                  {t('profile.industry.noResults')}
                </Text>
              }
            />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              contentContainerStyle={listPadding}
              ListHeaderComponent={notSpecified}
              renderSectionHeader={({ section }) => (
                <Text
                  accessibilityRole="header"
                  style={[styles.sectionHeader, { color: palette.textMuted }]}
                >
                  {section.title}
                </Text>
              )}
              renderItem={({ item }) => renderOption(item)}
            />
          )}
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
  valueText: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  placeholderText: { flex: 1, fontSize: fontSize.md },
  modalRoot: { flex: 1 },
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
  headerSpacer: { width: 48 },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  searchInput: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    fontSize: fontSize.md,
  },
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  optionName: { flex: 1, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  empty: { textAlign: 'center', paddingVertical: spacing.xl, fontSize: fontSize.md },
});
