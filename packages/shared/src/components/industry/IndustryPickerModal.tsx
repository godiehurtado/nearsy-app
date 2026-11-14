/**
 * Industry picker (2.1.0, approved UX): a modal with search over EN/ES labels
 * and synonyms, rows with local icons, the selection checked, and
 * "Sin especificar / Not specified". No free text, no Logo.dev.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../i18n';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { industrySectorColor } from '../../industries/industryColors.ts';
import {
  industryLang,
  industryMaterialIcon,
  industryPickerSections,
  searchIndustries,
  type IndustryItem,
} from '../../industries/industryCatalog.ts';

type Props = {
  visible: boolean;
  /** Current value: a catalog id, or null for "Not specified". */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
};

type Row = { kind: 'unspecified' } | { kind: 'item'; item: IndustryItem };

export function IndustryPickerModal({ visible, selectedId, onSelect, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const lang = industryLang(i18n.language);

  const sections = useMemo(() => {
    const unspecified = { key: 'unspecified', title: '', data: [{ kind: 'unspecified' } as Row] };
    const trimmed = query.trim();
    if (trimmed) {
      const results = searchIndustries(trimmed).map((item) => ({ kind: 'item', item }) as Row);
      return [unspecified, { key: 'results', title: '', data: results }];
    }
    return [
      unspecified,
      ...industryPickerSections().map((section) => ({
        key: section.sector.id,
        title: section.sector.label[lang],
        data: section.items.map((item) => ({ kind: 'item', item }) as Row),
      })),
    ];
  }, [lang, query]);

  const noResults = query.trim().length > 0 && sections[1]?.data.length === 0;

  const close = () => {
    setQuery('');
    onClose();
  };
  const choose = (id: string | null) => {
    setQuery('');
    onSelect(id);
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    const id = row.kind === 'item' ? row.item.id : null;
    const selected = id === selectedId;
    const label =
      row.kind === 'item' ? row.item.label[lang] : t('profile.industry.unspecified');
    return (
      <Pressable
        onPress={() => choose(id)}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.row,
          { borderBottomColor: palette.border },
          pressed && { backgroundColor: palette.panel },
        ]}
      >
        {row.kind === 'item' ? (
          <MaterialCommunityIcons
            name={industryMaterialIcon(row.item.iconKey) as never}
            size={22}
            color={industrySectorColor(row.item.sector) ?? palette.textSecondary}
            style={styles.rowIcon}
          />
        ) : (
          <Ionicons name="remove-circle-outline" size={22} color={palette.textMuted} style={styles.rowIcon} />
        )}
        <Text style={[styles.rowLabel, { color: palette.textPrimary }]}>{label}</Text>
        {selected ? <Ionicons name="checkmark" size={22} color={palette.primary} /> : null}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: palette.textPrimary }]} accessibilityRole="header">
            {t('profile.industry.title')}
          </Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t('common.buttons.close')}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={palette.textPrimary} />
          </Pressable>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('profile.industry.searchPlaceholder')}
          placeholderTextColor={palette.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('profile.industry.searchPlaceholder')}
          style={[
            styles.search,
            { color: palette.textPrimary, backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        />
        <SectionList
          sections={sections}
          keyExtractor={(row) => (row.kind === 'item' ? row.item.id : 'unspecified')}
          renderItem={renderRow}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <Text
                style={[styles.sectionHeader, { color: palette.textMuted, backgroundColor: palette.background }]}
                accessibilityRole="header"
              >
                {section.title}
              </Text>
            ) : null
          }
          ListFooterComponent={
            noResults ? (
              <Text style={[styles.empty, { color: palette.textMuted }]}>
                {t('profile.industry.noResults')}
              </Text>
            ) : null
          }
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, flex: 1 },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { marginRight: spacing.md },
  rowLabel: { flex: 1, fontSize: fontSize.md },
  empty: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, fontSize: fontSize.sm },
});
