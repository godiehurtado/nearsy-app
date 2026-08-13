import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { InterestChip } from '../InterestChip';
import { FormInput } from './FormInput';
import { useTranslation } from '../../i18n';
import {
  buildCustomInterestId,
  countFinalOnboardingInterests,
  CUSTOM_INTEREST_MAX_LENGTH,
  getOnboardingCategory,
  ONBOARDING_CUSTOM_INTEREST_ICONS,
  validateCustomInterestInput,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from '../../interests/onboardingInterestCatalog';

type Props = {
  categoryId: OnboardingInterestCategoryId;
  selected: OnboardingSelectedInterest[];
  onChangeSelected: (next: OnboardingSelectedInterest[]) => void;
};

function toggleInList(
  list: OnboardingSelectedInterest[],
  item: OnboardingSelectedInterest,
): OnboardingSelectedInterest[] {
  const exists = list.some((s) => s.id === item.id);
  if (exists) return list.filter((s) => s.id !== item.id);
  return [...list, item];
}

export function OnboardingInterestCategoryPanel({
  categoryId,
  selected,
  onChangeSelected,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const category = getOnboardingCategory(categoryId);

  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [showOtherComposer, setShowOtherComposer] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const selectedInCategory = useMemo(
    () => selected.filter((s) => s.categoryId === categoryId),
    [selected, categoryId],
  );

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  const totalSelected = countFinalOnboardingInterests(selected);

  function categoryTitle() {
    return t(
      `onboarding.profileCompletion.interests.categories.${category.nameKey}` as any,
      { defaultValue: category.name },
    );
  }

  function itemLabel(nameKey: string, fallback: string) {
    return t(
      `onboarding.profileCompletion.interests.items.${nameKey}` as any,
      { defaultValue: fallback },
    );
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  function addCustom() {
    const result = validateCustomInterestInput({
      name: customName,
      icon: customIcon,
      categoryId,
      existingInCategory: selectedInCategory,
    });
    if (result.ok === false) {
      const reason = result.reason;
      setCustomError(
        t(
          `onboarding.profileCompletion.interests.custom.errors.${reason}` as any,
        ),
      );
      return;
    }
    const entry: OnboardingSelectedInterest = {
      id: buildCustomInterestId(categoryId, result.name),
      name: result.name,
      categoryId,
      icon: result.icon,
      iconColor: result.iconColor,
      isCustom: true,
    };
    onChangeSelected([...selected, entry]);
    setCustomName('');
    setCustomIcon(null);
    setCustomError(null);
    setShowOtherComposer(false);
  }

  function renderChip(params: {
    id: string;
    name: string;
    nameKey: string;
    icon: string;
    iconColor: string;
    isOther?: boolean;
    groupId?: string;
  }) {
    if (params.isOther) {
      const active = showOtherComposer;
      return (
        <InterestChip
          key={params.id}
          name={itemLabel(params.nameKey, params.name)}
          icon={params.icon}
          iconColor={params.iconColor}
          selected={active}
          onPress={() => {
            setShowOtherComposer((v) => !v);
            setCustomError(null);
          }}
        />
      );
    }

    const active = selectedIds.has(params.id);
    const nextItem: OnboardingSelectedInterest = {
      id: params.id,
      name: params.name,
      categoryId,
      icon: params.icon,
      iconColor: params.iconColor,
      ...(params.groupId ? { groupId: params.groupId } : {}),
    };
    return (
      <InterestChip
        key={params.id}
        name={itemLabel(params.nameKey, params.name)}
        icon={params.icon}
        iconColor={params.iconColor}
        selected={active}
        onPress={() => {
          onChangeSelected(toggleInList(selected, nextItem));
        }}
      />
    );
  }

  return (
    <View>
      <Text style={[styles.title, { color: palette.textPrimary }]}>
        {categoryTitle()}
      </Text>
      <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
        {t('onboarding.profileCompletion.interests.selectedCount', {
          count: totalSelected,
        })}
      </Text>

      {category.groups ? (
        <View style={styles.groups}>
          {category.groups.map((g) => {
            const open = expandedGroups.includes(g.id);
            return (
              <View key={g.id} style={styles.groupBlock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => toggleGroup(g.id)}
                  style={[
                    styles.groupHeader,
                    {
                      borderColor: open ? palette.primary : palette.border,
                      backgroundColor: open ? palette.chipBg : palette.panel,
                    },
                  ]}
                >
                  <View style={styles.groupHeaderLeft}>
                    <Ionicons
                      name={g.icon as any}
                      size={20}
                      color={g.iconColor}
                    />
                    <Text
                      style={[
                        styles.groupTitle,
                        { color: palette.textPrimary },
                      ]}
                    >
                      {itemLabel(g.nameKey, g.name)}
                    </Text>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={palette.textSecondary}
                  />
                </Pressable>
                {open ? (
                  <View style={styles.chipWrap}>
                    {g.items.map((it) =>
                      renderChip({
                        id: it.id,
                        name: it.name,
                        nameKey: it.nameKey,
                        icon: it.icon,
                        iconColor: it.iconColor,
                        groupId: g.id,
                      }),
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.chipWrap}>
          {(category.items ?? []).map((it) =>
            renderChip({
              id: it.id,
              name: it.name,
              nameKey: it.nameKey,
              icon: it.icon,
              iconColor: it.iconColor,
              isOther: it.isOther,
            }),
          )}
        </View>
      )}

      {selectedInCategory.filter((s) => s.isCustom).length > 0 ? (
        <View style={[styles.chipWrap, { marginTop: spacing.md }]}>
          {selectedInCategory
            .filter((s) => s.isCustom)
            .map((s) => (
              <InterestChip
                key={s.id}
                name={s.name}
                icon={s.icon}
                iconColor={s.iconColor}
                selected
                onPress={() =>
                  onChangeSelected(selected.filter((x) => x.id !== s.id))
                }
              />
            ))}
        </View>
      ) : null}

      {showOtherComposer ? (
        <View
          style={[
            styles.composer,
            { borderColor: palette.border, backgroundColor: palette.panel },
          ]}
        >
          <Text style={[styles.composerTitle, { color: palette.textPrimary }]}>
            {t('onboarding.profileCompletion.interests.custom.title')}
          </Text>
          <FormInput
            label={t('onboarding.profileCompletion.interests.custom.nameLabel')}
            placeholder={t(
              'onboarding.profileCompletion.interests.custom.namePlaceholder',
            )}
            value={customName}
            onChangeText={(v) => {
              setCustomName(v.slice(0, CUSTOM_INTEREST_MAX_LENGTH));
              setCustomError(null);
            }}
            maxLength={CUSTOM_INTEREST_MAX_LENGTH}
            autoCapitalize="words"
          />
          <Text style={[styles.iconLabel, { color: palette.textMuted }]}>
            {t('onboarding.profileCompletion.interests.custom.iconLabel')}
          </Text>
          <View style={styles.iconGrid}>
            {ONBOARDING_CUSTOM_INTEREST_ICONS.map((icon) => {
              const active = customIcon === icon;
              return (
                <Pressable
                  key={icon}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setCustomIcon(icon);
                    setCustomError(null);
                  }}
                  style={[
                    styles.iconCell,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active
                        ? palette.chipBg
                        : palette.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name={icon as any}
                    size={22}
                    color={active ? palette.primary : palette.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
          {customError ? (
            <Text style={{ color: palette.danger, marginTop: spacing.sm }}>
              {customError}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={addCustom}
            style={[styles.addBtn, { backgroundColor: palette.primary }]}
          >
            <Text style={styles.addBtnText}>
              {t('onboarding.profileCompletion.interests.custom.add')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.3,
    lineHeight: fontSize.xl * 1.2,
  },
  subtitle: {
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  groups: { gap: spacing.md },
  groupBlock: { gap: spacing.sm },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  groupTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    flexShrink: 1,
  },
  composer: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  composerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  iconLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.md,
  },
});
