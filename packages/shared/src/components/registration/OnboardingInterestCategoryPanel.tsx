import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext.tsx';
import { fontSize, fontWeight } from '../../theme/typography.ts';
import { spacing } from '../../theme/spacing.ts';
import { InterestChip } from '../InterestChip.tsx';
import { useTranslation } from '../../i18n/index.ts';
import {
  buildCustomInterestId,
  countFinalOnboardingInterests,
  getOnboardingCategory,
  validateCustomInterestInput,
  type OnboardingInterestCategoryId,
  type OnboardingSelectedInterest,
} from '../../interests/onboardingInterestCatalog.ts';
import {
  getHierarchicalGroups,
  isHierarchicalInterestCategory,
  resolveActiveGroupId,
} from '../../interests/interestHierarchy.ts';
import { HierarchicalInterestSelector } from './HierarchicalInterestSelector.tsx';
import { OnboardingInterestCustomComposer } from './OnboardingInterestCustomComposer.tsx';
import {
  otherScopeForGroup,
  isOtherComposerOpen,
} from './interestOtherScope.ts';

type Props = {
  categoryId: OnboardingInterestCategoryId;
  selected: OnboardingSelectedInterest[];
  onChangeSelected: (next: OnboardingSelectedInterest[]) => void;
  /** Required for hierarchical categories — owned by ProfileCompletionScreen. */
  activeGroupId?: string;
  onActiveGroupChange?: (groupId: string) => void;
  customRemoveAccessibilityLabel?: (name: string) => string;
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
  activeGroupId,
  onActiveGroupChange,
  customRemoveAccessibilityLabel,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const category = getOnboardingCategory(categoryId);
  const hierarchical = isHierarchicalInterestCategory(category);
  const groups = getHierarchicalGroups(category);

  const resolvedActiveGroupId = useMemo(() => {
    if (!hierarchical) return null;
    return resolveActiveGroupId(category, activeGroupId);
  }, [activeGroupId, category, hierarchical]);

  const [otherComposerScope, setOtherComposerScope] = useState<string | null>(
    null,
  );
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [customIconColor, setCustomIconColor] = useState<string | null>(null);
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

  function groupLabel(nameKey: string, fallback: string) {
    return t(
      `onboarding.profileCompletion.interests.groups.${nameKey}` as any,
      { defaultValue: fallback },
    );
  }

  function closeComposer() {
    setOtherComposerScope(null);
    setCustomName('');
    setCustomIcon(null);
    setCustomIconColor(null);
    setCustomError(null);
  }

  function toggleOther(groupId?: string) {
    const scope = otherScopeForGroup(groupId);
    setOtherComposerScope((prev) => (prev === scope ? null : scope));
    setCustomError(null);
    if (otherComposerScope === scope) {
      setCustomName('');
      setCustomIcon(null);
      setCustomIconColor(null);
    }
  }

  function addCustom(groupId?: string) {
    const result = validateCustomInterestInput({
      name: customName,
      icon: customIcon,
      iconColor: customIconColor,
      categoryId,
      groupId: groupId ?? null,
      existingInCategory: selectedInCategory,
    });
    if (result.ok === false) {
      setCustomError(
        t(
          `onboarding.profileCompletion.interests.custom.errors.${result.reason}` as any,
        ),
      );
      return;
    }
    const entry: OnboardingSelectedInterest = {
      id: buildCustomInterestId(categoryId, result.name, groupId),
      name: result.name,
      categoryId,
      icon: result.icon,
      iconColor: result.iconColor,
      isCustom: true,
      ...(groupId ? { groupId } : {}),
    };
    onChangeSelected([...selected, entry]);
    closeComposer();
  }

  function renderComposer(groupId?: string) {
    if (!isOtherComposerOpen(otherComposerScope, groupId)) return null;
    return (
      <OnboardingInterestCustomComposer
        customName={customName}
        customIcon={customIcon}
        customError={customError}
        onChangeName={(value) => {
          setCustomName(value);
          setCustomError(null);
        }}
        onSelectIcon={(icon, iconColor) => {
          setCustomIcon(icon);
          setCustomIconColor(iconColor);
          setCustomError(null);
        }}
        onAdd={() => addCustom(groupId)}
        onCancel={closeComposer}
      />
    );
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
      const composerOpen = isOtherComposerOpen(
        otherComposerScope,
        params.groupId,
      );
      return (
        <InterestChip
          key={params.id}
          name={itemLabel(params.nameKey, params.name)}
          icon={params.icon}
          iconColor={params.iconColor}
          variant="other"
          selected={composerOpen}
          onPress={() => toggleOther(params.groupId)}
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

      {hierarchical && resolvedActiveGroupId ? (
        <HierarchicalInterestSelector
          categoryId={categoryId}
          groups={groups}
          activeGroupId={resolvedActiveGroupId}
          onSelectGroup={(groupId) => {
            onActiveGroupChange?.(groupId);
            closeComposer();
          }}
          groupLabel={groupLabel}
          renderChip={renderChip}
          composer={renderComposer(resolvedActiveGroupId)}
        />
      ) : hierarchical ? (
        <Text style={{ color: palette.danger }}>
          {t('common.error')}
        </Text>
      ) : (
        <>
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
          {renderComposer()}
        </>
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
                accessibilityLabel={
                  customRemoveAccessibilityLabel
                    ? customRemoveAccessibilityLabel(s.name)
                    : s.name
                }
                onPress={() =>
                  onChangeSelected(selected.filter((x) => x.id !== s.id))
                }
              />
            ))}
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
    justifyContent: 'center',
  },
});
