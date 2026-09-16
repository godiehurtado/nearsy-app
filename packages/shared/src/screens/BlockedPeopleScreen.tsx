/**
 * Settings — Blocked People (owner list + unblock).
 * Identity via getBlockedPeople only (no peer user docs or Discovery Detail).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { firebaseAuth } from '../config/firebaseConfig';
import { useTranslation } from '../i18n';
import {
  fontSize,
  fontWeight,
  radius,
  screenPadding,
  spacing,
  useAppTheme,
} from '../theme';
import {
  buildGetBlockedPeopleRequest,
  type BlockedPerson,
} from '../visibility/callables';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import { unblockCandidateUser } from '../visibility/unblockCandidate';

const AVATAR_SIZE = 48;

export default function BlockedPeopleScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useAppTheme();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const client = await getVisibilityDiscoveryClient();
      const response = await client.getBlockedPeople(
        buildGetBlockedPeopleRequest(),
      );
      setPeople(response.people);
    } catch {
      setLoadError(true);
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modeLabel = useCallback(
    (mode: 'personal' | 'professional') =>
      mode === 'professional'
        ? t('discoveryProfile.modeProfessional')
        : t('discoveryProfile.modePersonal'),
    [t],
  );

  const displayLabel = useCallback(
    (person: BlockedPerson) =>
      person.available
        ? person.displayName
        : t('settings.blockedPeople.unavailable'),
    [t],
  );

  const confirmUnblock = useCallback(
    (person: BlockedPerson) => {
      const title = person.available
        ? t('settings.blockedPeople.unblockConfirmTitle', {
            name: person.displayName,
          })
        : t('settings.blockedPeople.unblockConfirmTitleUnavailable');
      Alert.alert(title, t('settings.blockedPeople.unblockConfirmBody'), [
        {
          text: t('settings.blockedPeople.cancel'),
          style: 'cancel',
        },
        {
          text: t('settings.blockedPeople.unblock'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const myUid = firebaseAuth.currentUser?.uid;
              if (!myUid) {
                Alert.alert(
                  t('common.appName'),
                  t('settings.blockedPeople.unblockError'),
                );
                return;
              }
              setUnblockingUid(person.uid);
              const result = await unblockCandidateUser({
                myUid,
                candidateUid: person.uid,
              });
              setUnblockingUid(null);
              if (!result.ok) {
                Alert.alert(
                  t('common.appName'),
                  t('settings.blockedPeople.unblockError'),
                );
                return;
              }
              setPeople((prev) => prev.filter((p) => p.uid !== person.uid));
            })();
          },
        },
      ]);
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: BlockedPerson }) => {
      const name = displayLabel(item);
      const subtitle = item.available ? modeLabel(item.mode) : null;
      const busy = unblockingUid === item.uid;
      const imageUri =
        item.available && item.profileImage ? item.profileImage : null;

      return (
        <View
          style={[
            styles.row,
            {
              borderBottomColor: palette.border,
            },
          ]}
          accessibilityRole="summary"
          accessibilityLabel={
            subtitle ? `${name}, ${subtitle}` : name
          }
        >
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: palette.chipBg,
                borderColor: palette.border,
              },
            ]}
          >
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.avatarImage}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Ionicons
                name="person-outline"
                size={22}
                color={palette.textMuted}
              />
            )}
          </View>
          <View style={styles.textCol}>
            <Text
              style={[styles.name, { color: palette.textPrimary }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            {subtitle ? (
              <Text
                style={[styles.subtitle, { color: palette.textSecondary }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.blockedPeople.unblock')}
            disabled={busy}
            onPress={() => confirmUnblock(item)}
            style={({ pressed }) => [
              styles.unblockBtn,
              {
                borderColor: palette.danger,
                opacity: busy ? 0.55 : pressed ? 0.88 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={palette.danger} />
            ) : (
              <Text style={[styles.unblockText, { color: palette.danger }]}>
                {t('settings.blockedPeople.unblock')}
              </Text>
            )}
          </Pressable>
        </View>
      );
    },
    [confirmUnblock, displayLabel, modeLabel, palette, t, unblockingUid],
  );

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings.blockedPeople.back')}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={palette.textPrimary}
          />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: palette.textPrimary }]}
        >
          {t('settings.blockedPeople.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View
          style={styles.centered}
          accessibilityLiveRegion="polite"
          accessibilityLabel={t('settings.blockedPeople.loading')}
        >
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={[styles.loadingText, { color: palette.textSecondary }]}>
            {t('settings.blockedPeople.loading')}
          </Text>
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
            {t('settings.blockedPeople.loadError')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.blockedPeople.retry')}
            onPress={() => void load()}
            style={({ pressed }) => [
              styles.retryBtn,
              {
                backgroundColor: palette.primary,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Text style={styles.retryText}>
              {t('settings.blockedPeople.retry')}
            </Text>
          </Pressable>
        </View>
      ) : people.length === 0 ? (
        <View style={styles.centered}>
          <Text style={[styles.emptyTitle, { color: palette.textPrimary }]}>
            {t('settings.blockedPeople.empty')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingBottom: 32 + insets.bottom,
            backgroundColor: palette.background,
          }}
          style={{ backgroundColor: palette.background }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 52,
    paddingHorizontal: screenPadding.horizontal,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  headerSpacer: { width: 26 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: screenPadding.horizontal,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  retryText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPadding.horizontal,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: spacing.md,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  textCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    marginTop: 2,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  unblockBtn: {
    minHeight: 36,
    minWidth: 88,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
