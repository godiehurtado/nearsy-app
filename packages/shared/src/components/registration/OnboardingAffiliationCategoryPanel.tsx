import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  Keyboard,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useTranslation } from '../../i18n';
import {
  resolveAffiliationSearchUi,
  type AffiliationSearchUiSnapshot,
} from '../../affiliations/affiliationSearchInteraction';
import {
  buildCustomAffiliationId,
  getOnboardingAffiliationCategory,
  isDuplicateAffiliation,
  validateCustomAffiliationName,
  type OnboardingAffiliationCategoryId,
  type OnboardingSelectedAffiliation,
} from '../../affiliations/onboardingAffiliationCatalog';
import type { AffiliationEntitySearchResult } from '../../affiliations/affiliationEntitySearchProvider';
import { AffiliationEntitySearchClientError } from '../../affiliations/affiliationEntitySearchContract';
import { getAffiliationEntitySearchProvider } from '../../affiliations/affiliationEntitySearchRuntime';
import {
  buildLogoDevImageUrl,
  domainFromAffiliationFields,
  isLogoDevPublishableKey,
} from '../../affiliations/affiliationLogoDev';
import {
  LOGO_DEV_PUBLISHABLE_KEY_ENV,
  readLogoDevPublishableKey,
} from '../../affiliations/affiliationLogoDevConfig';
import { resolveAffiliationLogoPresentation } from '../../affiliations/affiliationLogo';

type Props = {
  categoryId: OnboardingAffiliationCategoryId;
  selected: OnboardingSelectedAffiliation[];
  onChangeSelected: (next: OnboardingSelectedAffiliation[]) => void;
  onSearchUiChange?: (ui: AffiliationSearchUiSnapshot) => void;
  searchAddRef?: React.MutableRefObject<(() => void) | null>;
  contentScrollRef?: React.RefObject<ScrollView | null>;
};

const SEARCH_DEBOUNCE_MS = 300;
const RESULT_TILE_RADIUS = 12;
const SELECTED_TILE_RADIUS = 18;
const QUERY_MAX = 40;

function readClientPublishableKey(): string | undefined {
  const fromEnv = readLogoDevPublishableKey();
  if (fromEnv) return fromEnv;
  try {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
    const raw = extra[LOGO_DEV_PUBLISHABLE_KEY_ENV];
    if (typeof raw === 'string' && isLogoDevPublishableKey(raw)) {
      return raw.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function AffiliationLogo({
  name,
  categoryId,
  logoUrl,
  size,
  borderRadius: tileRadius,
}: {
  name: string;
  categoryId: OnboardingAffiliationCategoryId;
  logoUrl?: string | null;
  size: number;
  borderRadius: number;
}) {
  const { palette } = useAppTheme();
  const [remoteFailed, setRemoteFailed] = useState(false);
  const presentation = resolveAffiliationLogoPresentation({
    name,
    categoryId,
    logoUrl: remoteFailed ? null : logoUrl,
  });

  if (presentation.kind === 'remote' && presentation.logoUrl) {
    return (
      <Image
        source={{ uri: presentation.logoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: tileRadius,
          backgroundColor: palette.chipBg,
        }}
        onError={() => setRemoteFailed(true)}
      />
    );
  }

  if (presentation.kind === 'initials') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: tileRadius,
          backgroundColor: presentation.avatarColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: '#fff',
            fontSize: size * 0.32,
            fontWeight: fontWeight.extrabold,
            letterSpacing: -0.4,
          }}
        >
          {presentation.initials}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: tileRadius,
        backgroundColor: palette.chipBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.36 }}>
        {getOnboardingAffiliationCategory(categoryId).emoji}
      </Text>
    </View>
  );
}

export function OnboardingAffiliationCategoryPanel({
  categoryId,
  selected,
  onChangeSelected,
  onSearchUiChange,
  searchAddRef,
  contentScrollRef,
}: Props) {
  const { palette } = useAppTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const category = getOnboardingAffiliationCategory(categoryId);

  const [topicId, setTopicId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [draftImage, setDraftImage] = useState<string | null>(null);
  const [results, setResults] = useState<AffiliationEntitySearchResult[]>([]);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [suggestionsUnavailable, setSuggestionsUnavailable] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const searchGenerationRef = useRef(0);
  const searchInputRef = useRef<TextInput>(null);
  const publishableKey = readClientPublishableKey();

  const selectedInCategory = useMemo(
    () => selected.filter((s) => s.categoryId === categoryId),
    [selected, categoryId],
  );

  const activeTopic = category.topics.find((topic) => topic.id === topicId);
  const topicOpen = !!activeTopic;
  const trimmedQuery = query.trim();
  const customNameValid = validateCustomAffiliationName(trimmedQuery).ok === true;
  const searchHintVisible = trimmedQuery.length < 2;
  const searchUi = useMemo(
    () =>
      resolveAffiliationSearchUi({
        searchFocused,
        pickedName,
        customName: trimmedQuery,
        customNameValid,
        hasProviderResults: results.length > 0,
        searchPending,
        suggestionsUnavailable,
        hasDraftImage: !!draftImage,
      }),
    [
      searchFocused,
      pickedName,
      trimmedQuery,
      customNameValid,
      results.length,
      searchPending,
      suggestionsUnavailable,
      draftImage,
    ],
  );
  const compactSearch = searchUi.hideJourneyFooter;

  function displayLogoUrl(input: {
    logoUrl?: string | null;
    website?: string | null;
    providerId?: string | null;
  }): string | undefined {
    if (input.logoUrl?.trim()) return input.logoUrl.trim();
    return buildLogoDevImageUrl(
      domainFromAffiliationFields(input),
      publishableKey,
    );
  }

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      searchGenerationRef.current += 1;
      setResults([]);
      setSuggestionsUnavailable(false);
      setSearchPending(false);
      return;
    }
    const generation = ++searchGenerationRef.current;
    setSearchPending(true);
    const handle = setTimeout(() => {
      void getAffiliationEntitySearchProvider()
        .search(trimmedQuery, categoryId)
        .then((rows) => {
          if (generation !== searchGenerationRef.current) return;
          setSuggestionsUnavailable(false);
          setResults(rows);
          setSearchPending(false);
        })
        .catch((error) => {
          if (generation !== searchGenerationRef.current) return;
          setResults([]);
          setSuggestionsUnavailable(true);
          setSearchPending(false);
          if (__DEV__ && error instanceof AffiliationEntitySearchClientError) {
            console.warn('[AffiliationSearch]', error.code);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmedQuery, categoryId]);

  const totalAdded = selected.length;
  const countLabel =
    totalAdded === 0
      ? t('onboarding.profileCompletion.affiliations.optionalLine' as any)
      : t('onboarding.profileCompletion.affiliations.addedCount' as any, {
          count: totalAdded,
        });

  useEffect(() => {
    onSearchUiChange?.(searchUi);
  }, [searchUi, onSearchUiChange]);

  function scrollSearchIntoView() {
    contentScrollRef?.current?.scrollTo({
      y: 0,
      animated: !reduceMotion,
    });
  }

  function scheduleScrollSearchIntoView() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollSearchIntoView();
      });
    });
  }

  useEffect(() => {
    if (!searchFocused) return;
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      scheduleScrollSearchIntoView();
    });
    return () => shown.remove();
  }, [searchFocused, reduceMotion]);

  useEffect(() => {
    setTopicId(null);
    setQuery('');
    setPickedName(null);
    setDraftImage(null);
    setResults([]);
    setDuplicateError(null);
    setSuggestionsUnavailable(false);
    setSearchFocused(false);
    setSearchPending(false);
  }, [categoryId]);

  function toggleTopic(nextId: string) {
    setTopicId((prev) => (prev === nextId ? null : nextId));
    setQuery('');
    setPickedName(null);
    setDraftImage(null);
    setResults([]);
    setDuplicateError(null);
    setSearchFocused(false);
  }

  function pickResult(result: AffiliationEntitySearchResult) {
    setPickedName(result.name);
    setQuery(result.name.slice(0, QUERY_MAX));
    setDraftImage(null);
    setDuplicateError(null);
  }

  async function pickOwnLogo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setDraftImage(result.assets[0].uri);
    }
  }

  function addFromSearch() {
    const nameCandidate = (pickedName || trimmedQuery).slice(0, QUERY_MAX);
    const validated = validateCustomAffiliationName(nameCandidate);
    if (validated.ok === false) return;

    const matched = results.find(
      (row) => row.name.toLowerCase() === validated.name.toLowerCase(),
    );
    const explicitlyPicked =
      !!pickedName &&
      !!matched &&
      matched.isQueryMatch !== true &&
      pickedName.toLowerCase() === matched.name.toLowerCase();
    const isCustom = !explicitlyPicked;
    const candidate = isCustom
      ? { name: validated.name, source: 'custom' as const }
      : {
          name: validated.name,
          source: 'provider' as const,
          providerId: matched!.providerId,
        };

    if (isDuplicateAffiliation(selected, candidate)) {
      setDuplicateError(
        t('onboarding.profileCompletion.affiliations.duplicate' as any),
      );
      return;
    }

    const next: OnboardingSelectedAffiliation = {
      id: isCustom
        ? buildCustomAffiliationId(categoryId, validated.name)
        : matched!.providerId,
      name: validated.name,
      categoryId,
      source: isCustom ? 'custom' : 'provider',
      ...(isCustom ? {} : { providerId: matched!.providerId }),
      ...(!isCustom && matched?.provider ? { provider: matched.provider } : {}),
      ...(draftImage ? { logoUrl: draftImage } : {}),
      ...(!isCustom && matched?.website ? { website: matched.website } : {}),
      ...(activeTopic ? { topic: activeTopic.label } : {}),
    };

    onChangeSelected([...selected, next]);
    setQuery('');
    setPickedName(null);
    setDraftImage(null);
    setResults([]);
    setTopicId(null);
    setDuplicateError(null);
    setSearchFocused(false);
    setSearchPending(false);
    setSuggestionsUnavailable(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  }

  useEffect(() => {
    if (!searchAddRef) return;
    searchAddRef.current = addFromSearch;
    return () => {
      searchAddRef.current = null;
    };
  });

  function removeAffiliation(id: string) {
    onChangeSelected(selected.filter((s) => s.id !== id));
  }

  return (
    <View style={[styles.wrap, compactSearch ? styles.wrapSearch : null]}>
      <Text style={[styles.eyebrow, { color: palette.chipText }]}>
        {t('onboarding.profileCompletion.affiliations.eyebrow' as any)}
      </Text>
      <View style={styles.titleRow}>
        <Text
          style={styles.emoji}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {category.emoji}
        </Text>
        <Text style={[styles.title, { color: palette.textPrimary }]}>
          {t(
            `onboarding.profileCompletion.affiliations.categories.${category.nameKey}` as any,
            { defaultValue: category.name },
          )}
        </Text>
      </View>
      {!compactSearch ? (
        <>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
            {t(
              `onboarding.profileCompletion.affiliations.subtitles.${category.subtitleKey}` as any,
              { defaultValue: category.subtitle },
            )}
          </Text>
          <Text style={[styles.countLabel, { color: palette.chipText }]}>
            {countLabel}
          </Text>

          {selectedInCategory.length > 0 ? (
            <View style={styles.selectedWrap}>
              {selectedInCategory.map((item) => (
                <View key={item.id} style={styles.selectedTile}>
                  <View>
                    <AffiliationLogo
                      name={item.name}
                      categoryId={item.categoryId}
                      logoUrl={displayLogoUrl(item)}
                      size={64}
                      borderRadius={SELECTED_TILE_RADIUS}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'onboarding.profileCompletion.affiliations.removeA11y' as any,
                        { name: item.name },
                      )}
                      hitSlop={8}
                      onPress={() => removeAffiliation(item.id)}
                      style={[
                        styles.removeBadge,
                        {
                          backgroundColor: palette.background,
                          borderColor: palette.accentBorder,
                        },
                      ]}
                    >
                      <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: fontWeight.extrabold }}>
                        ×
                      </Text>
                    </Pressable>
                  </View>
                  <Text
                    style={[styles.selectedLabel, { color: palette.textPrimary }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.rule, { backgroundColor: palette.accentBorder }]} />

          <View style={styles.chips}>
            {category.topics.map((topic) => {
              const on = topic.id === topicId;
              return (
                <Pressable
                  key={topic.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={topic.label}
                  onPress={() => toggleTopic(topic.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? palette.primary : palette.chipBg,
                      borderColor: on ? palette.primary : palette.accentBorder,
                    },
                  ]}
                >
                  <Text style={styles.chipEmoji}>{topic.emoji}</Text>
                  <Text
                    style={[
                      styles.chipLabel,
                      {
                        color: on ? '#FFFFFF' : palette.textSecondary,
                        fontWeight: on ? fontWeight.extrabold : fontWeight.semibold,
                      },
                    ]}
                  >
                    {t(
                      `onboarding.profileCompletion.affiliations.topics.${topic.id}` as any,
                      { defaultValue: topic.label },
                    )}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {topicOpen ? (
        <View
          style={[
            styles.searchPanel,
            compactSearch ? styles.searchPanelFocused : null,
            {
              backgroundColor: palette.panel,
              borderColor: palette.accentBorder,
            },
          ]}
        >
          <Text style={[styles.topicEyebrow, { color: palette.chipText }]}>
            {activeTopic?.label}
          </Text>
          <View collapsable={false}>
            <TextInput
              ref={searchInputRef}
              accessibilityLabel={t(
                'onboarding.profileCompletion.affiliations.searchA11y' as any,
              )}
              placeholder={t(
                'onboarding.profileCompletion.affiliations.searchPlaceholder' as any,
              )}
              placeholderTextColor={palette.placeholder}
              value={query}
              onChangeText={(value) => {
                setQuery(value.slice(0, QUERY_MAX));
                setPickedName(null);
                setDuplicateError(null);
              }}
              onFocus={() => {
                setSearchFocused(true);
                scheduleScrollSearchIntoView();
              }}
              onBlur={() => {
                setSearchFocused(false);
              }}
              onSubmitEditing={() => {
                if (searchUi.showAddCta) addFromSearch();
              }}
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="words"
              style={[
                styles.searchInput,
                {
                  color: palette.textPrimary,
                  borderColor: palette.accentBorder,
                },
              ]}
            />
          </View>

          {searchHintVisible ? (
            <Text style={[styles.searchHint, { color: palette.textSecondary }]}>
              {t('onboarding.profileCompletion.affiliations.searchHint' as any)}
            </Text>
          ) : null}

          {suggestionsUnavailable ? (
            <Text
              style={[
                styles.searchUnavailable,
                { color: palette.danger, backgroundColor: palette.dangerBg },
              ]}
            >
              {t(
                'onboarding.profileCompletion.affiliations.suggestionsUnavailable' as any,
              )}
            </Text>
          ) : null}

          {results.length > 0 ? (
            <ScrollView
              style={compactSearch ? styles.resultsScroll : styles.resultsIdle}
              contentContainerStyle={styles.results}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              nestedScrollEnabled
            >
              {results.map((result) => {
                const on = pickedName === result.name;
                return (
                  <Pressable
                    key={result.providerId}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={result.name}
                    onPress={() => pickResult(result)}
                    style={[
                      styles.resultRow,
                      {
                        backgroundColor: on ? palette.primary : 'transparent',
                        borderColor: on ? palette.primary : palette.accentBorder,
                        borderWidth: on ? 2 : 1,
                      },
                    ]}
                  >
                    <AffiliationLogo
                      name={result.name}
                      categoryId={categoryId}
                      logoUrl={displayLogoUrl(result)}
                      size={40}
                      borderRadius={RESULT_TILE_RADIUS}
                    />
                    <Text
                      style={[
                        styles.resultName,
                        { color: on ? '#FFFFFF' : palette.textPrimary },
                      ]}
                      numberOfLines={2}
                    >
                      {result.name}
                    </Text>
                    {on ? (
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        style={styles.selectedCheck}
                      >
                        ✓
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {draftImage ? (
            <View style={styles.uploadPreview}>
              <Image source={{ uri: draftImage }} style={styles.uploadThumb} />
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
                {t('onboarding.profileCompletion.affiliations.usingOwnImage' as any)}
              </Text>
            </View>
          ) : null}

          {duplicateError ? (
            <Text style={[styles.duplicate, { color: palette.danger }]}>
              {duplicateError}
            </Text>
          ) : null}

          <View style={styles.searchActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                'onboarding.profileCompletion.affiliations.uploadA11y' as any,
              )}
              onPress={() => {
                void pickOwnLogo();
              }}
              style={[
                styles.uploadBtn,
                { borderColor: palette.accentBorder },
              ]}
            >
              <Text style={{ color: palette.textSecondary, fontWeight: fontWeight.bold, fontSize: 12.5 }}>
                {t('onboarding.profileCompletion.affiliations.upload' as any)}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  wrapSearch: { flex: 1 },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 7,
  },
  emoji: { fontSize: 23, lineHeight: 28 },
  title: {
    flex: 1,
    fontSize: 25,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
    lineHeight: 29,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    marginTop: 12,
  },
  selectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 16,
  },
  selectedTile: {
    width: 72,
    alignItems: 'center',
    gap: 6,
  },
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    lineHeight: 14,
  },
  rule: {
    height: 1,
    marginVertical: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 44,
  },
  chipEmoji: { fontSize: 14, lineHeight: 16 },
  chipLabel: { fontSize: 12.5 },
  searchPanel: {
    marginTop: 14,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
  },
  searchPanelFocused: {
    flex: 1,
    marginTop: 10,
  },
  topicEyebrow: {
    fontSize: 11,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  searchInput: {
    width: '100%',
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    minHeight: 44,
  },
  searchHint: {
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 9,
  },
  searchUnavailable: {
    marginTop: 9,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: fontWeight.bold,
  },
  results: {
    gap: 7,
  },
  resultsIdle: {
    marginTop: 11,
  },
  resultsScroll: {
    flex: 1,
    minHeight: 0,
    marginTop: 11,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 58,
  },
  resultName: {
    flex: 1,
    fontSize: 13,
    fontWeight: fontWeight.bold,
  },
  selectedCheck: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: fontWeight.extrabold,
    minWidth: 20,
    textAlign: 'center',
  },
  uploadPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 11,
  },
  uploadThumb: {
    width: 40,
    height: 40,
    borderRadius: RESULT_TILE_RADIUS,
  },
  duplicate: {
    marginTop: spacing.sm,
    fontSize: fontSize.xs,
  },
  searchActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },
  uploadBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
