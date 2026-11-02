import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';
import { radius } from '../../theme/radius.ts';
import { FormInput } from './FormInput.tsx';
import { useTranslation } from '../../i18n/index.ts';
import {
  CUSTOM_INTEREST_MAX_LENGTH,
  customInterestIconCategoryLabel,
  CUSTOM_INTEREST_ICON_CATEGORY_ORDER,
  filterCustomInterestIcons,
  resolveCustomInterestIconColor,
  type CustomInterestIconCategoryId,
  type CustomInterestIconOption,
} from '../../interests/onboardingInterestCatalog.ts';

type Props = {
  customName: string;
  customIcon: string | null;
  customError: string | null;
  onChangeName: (value: string) => void;
  onSelectIcon: (icon: string, iconColor: string) => void;
  onAdd: () => void;
  onCancel: () => void;
};

const ICON_COLUMNS = 5;

export function OnboardingInterestCustomComposer({
  customName,
  customIcon,
  customError,
  onChangeName,
  onSelectIcon,
  onAdd,
  onCancel,
}: Props) {
  const { palette } = useAppTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('es') ? 'es' : 'en';
  const { width } = useWindowDimensions();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconQuery, setIconQuery] = useState('');
  const [category, setCategory] = useState<CustomInterestIconCategoryId | 'all'>(
    'all',
  );
  const previewColor = customIcon
    ? resolveCustomInterestIconColor(customIcon)
    : palette.textMuted;

  const filtered = useMemo(() => {
    const matches = filterCustomInterestIcons(iconQuery, locale);
    if (category === 'all') return matches;
    return matches.filter((entry) => entry.category === category);
  }, [iconQuery, locale, category]);

  const cellSize = Math.max(
    48,
    Math.floor((Math.min(width, 480) - spacing.lg * 2 - spacing.sm * 6) / ICON_COLUMNS),
  );

  const selectIcon = (entry: CustomInterestIconOption) => {
    onSelectIcon(entry.icon, entry.iconColor);
    setPickerOpen(false);
  };

  const iconA11y = (entry: CustomInterestIconOption) =>
    locale === 'es' ? entry.searchEs.split(' ')[0]! : entry.searchEn.split(' ')[0]!;

  return (
    <View
      style={[
        styles.composer,
        { borderColor: palette.accentBorder, backgroundColor: palette.panel },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.composerTitle, { color: palette.textPrimary }]}>
          {t('onboarding.profileCompletion.interests.custom.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          hitSlop={8}
          style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={{ color: palette.primary, fontWeight: fontWeight.bold }}>
            {t('onboarding.profileCompletion.interests.custom.cancel')}
          </Text>
        </Pressable>
      </View>

      {customIcon ? (
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewIcon,
              {
                borderColor: palette.border,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Ionicons
              name={customIcon as React.ComponentProps<typeof Ionicons>['name']}
              size={20}
              color={previewColor}
            />
          </View>
          <Text style={[styles.previewHint, { color: palette.textMuted }]}>
            {t('onboarding.profileCompletion.interests.custom.previewHint')}
          </Text>
        </View>
      ) : null}

      <FormInput
        label={t('onboarding.profileCompletion.interests.custom.nameLabel')}
        placeholder={t(
          'onboarding.profileCompletion.interests.custom.namePlaceholder',
        )}
        value={customName}
        onChangeText={onChangeName}
        maxLength={CUSTOM_INTEREST_MAX_LENGTH}
        autoCapitalize="words"
      />
      <Text style={[styles.iconLabel, { color: palette.textMuted }]}>
        {t('onboarding.profileCompletion.interests.custom.iconLabel')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          'onboarding.profileCompletion.interests.custom.iconLabel',
        )}
        onPress={() => setPickerOpen(true)}
        style={[
          styles.pickerLaunch,
          {
            borderColor: palette.border,
            backgroundColor: palette.surface,
          },
        ]}
      >
        <Ionicons
          name={
            (customIcon as React.ComponentProps<typeof Ionicons>['name']) ||
            'apps-outline'
          }
          size={22}
          color={customIcon ? previewColor : palette.textMuted}
        />
        <Text style={[styles.pickerLaunchLabel, { color: palette.textPrimary }]}>
          {t('onboarding.profileCompletion.interests.custom.iconLabel')}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
      </Pressable>
      {customError ? (
        <Text style={{ color: palette.danger, marginTop: spacing.sm }}>
          {customError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        style={[styles.addBtn, { backgroundColor: palette.primary }]}
      >
        <Text style={styles.addBtnText}>
          {t('onboarding.profileCompletion.interests.custom.add')}
        </Text>
      </Pressable>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View
          style={[styles.modalRoot, { backgroundColor: palette.background }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.composerTitle, { color: palette.textPrimary }]}>
              {t('onboarding.profileCompletion.interests.custom.iconLabel')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'onboarding.profileCompletion.interests.custom.cancel',
              )}
              onPress={() => setPickerOpen(false)}
              hitSlop={8}
              style={styles.cancelBtn}
            >
              <Text style={{ color: palette.primary, fontWeight: fontWeight.bold }}>
                {t('onboarding.profileCompletion.interests.custom.cancel')}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={iconQuery}
            onChangeText={setIconQuery}
            placeholder={t(
              'onboarding.profileCompletion.interests.custom.iconSearchPlaceholder',
            )}
            placeholderTextColor={palette.placeholder}
            accessibilityLabel={t(
              'onboarding.profileCompletion.interests.custom.iconSearchPlaceholder',
            )}
            style={[
              styles.search,
              {
                color: palette.textPrimary,
                borderColor: palette.borderStrong,
                backgroundColor: palette.surface,
              },
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <View style={styles.categoryRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: category === 'all' }}
              onPress={() => setCategory('all')}
              style={[
                styles.categoryChip,
                {
                  borderColor:
                    category === 'all' ? palette.primary : palette.border,
                  backgroundColor:
                    category === 'all' ? palette.chipBg : palette.surface,
                },
              ]}
            >
              <Text style={{ color: palette.textPrimary, fontSize: fontSize.xs }}>
                {locale === 'es' ? 'Todos' : 'All'}
              </Text>
            </Pressable>
            {CUSTOM_INTEREST_ICON_CATEGORY_ORDER.map((id) => {
              const active = category === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCategory(id)}
                  style={[
                    styles.categoryChip,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active
                        ? palette.chipBg
                        : palette.surface,
                    },
                  ]}
                >
                  <Text
                    style={{ color: palette.textPrimary, fontSize: fontSize.xs }}
                  >
                    {customInterestIconCategoryLabel(id, locale)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(entry) => entry.icon}
            numColumns={ICON_COLUMNS}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.gridContent}
            ListEmptyComponent={
              <Text style={[styles.emptySearch, { color: palette.textMuted }]}>
                {t(
                  'onboarding.profileCompletion.interests.custom.iconSearchEmpty',
                )}
              </Text>
            }
            renderItem={({ item }) => {
              const active = customIcon === item.icon;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={iconA11y(item)}
                  onPress={() => selectIcon(item)}
                  style={[
                    styles.iconCell,
                    {
                      width: cellSize,
                      height: cellSize,
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active
                        ? palette.chipBg
                        : palette.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      item.icon as React.ComponentProps<
                        typeof Ionicons
                      >['name']
                    }
                    size={22}
                    color={item.iconColor}
                  />
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
  composer: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  composerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  cancelBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHint: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  iconLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  pickerLaunch: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pickerLaunchLabel: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  addBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
  modalRoot: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  search: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: fontSize.md,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  categoryChip: {
    borderWidth: 1,
    borderRadius: radius.pill ?? 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  gridContent: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  iconCell: {
    margin: spacing.xs,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySearch: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: fontSize.sm,
  },
});
