// src/components/TopHeader.tsx
import React from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TopBarMode = 'color' | 'image';

type Props = {
  topBarMode: TopBarMode;
  topBarColor: string;
  topBarImage?: string | null;
  profileImage?: string | null;

  // acciones izquierda
  leftIcon?: React.ComponentProps<typeof Ionicons>['name']; // p.ej. "chevron-back"
  onLeftPress?: () => void;

  // acciones derecha
  rightIcon?: React.ComponentProps<typeof Ionicons>['name']; // p.ej. "pencil" | "checkmark"
  onRightPress?: () => void;
  rightLoading?: boolean;
  rightDisabled?: boolean;

  // permite ocultar el avatar (si una pantalla no lo quiere)
  showAvatar?: boolean;

  // estilos extra opcionales
  containerStyle?: ViewStyle;
};

export default function TopHeader({
  topBarMode,
  topBarColor,
  topBarImage,
  profileImage,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  rightLoading,
  rightDisabled,
  showAvatar = true,
  containerStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        { paddingTop: insets.top, backgroundColor: '#fff' },
        containerStyle,
      ]}
    >
      <ImageBackground
        source={
          topBarMode === 'image' && topBarImage
            ? { uri: topBarImage }
            : undefined
        }
        resizeMode="cover"
        style={[styles.topBar, { backgroundColor: topBarColor }]}
        imageStyle={styles.topBarImg}
      >
        {topBarMode === 'image' && topBarImage ? (
          <View style={styles.topBarShade} />
        ) : null}

        {/* Fila de acciones */}
        <View style={styles.actionsRow}>
          {/* Botón izquierdo (opcional) */}
          {leftIcon ? (
            <TouchableOpacity
              onPress={onLeftPress}
              disabled={!onLeftPress}
              style={styles.actionBtn}
              activeOpacity={0.85}
            >
              <Ionicons name={leftIcon} size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36, height: 36 }} />
          )}

          {/* Marca centrada */}
          <View style={styles.brandCenter}>
            <Image
              source={require('../assets/icon_white.png')}
              style={styles.brandIcon}
            />
            <Text style={styles.brandText}>Nearsy</Text>
          </View>

          {/* Botón derecho (opcional) */}
          {rightIcon || rightLoading ? (
            <TouchableOpacity
              onPress={onRightPress}
              disabled={!onRightPress || rightDisabled}
              style={[
                styles.actionBtn,
                (rightDisabled || rightLoading) && { opacity: 0.6 },
              ]}
              activeOpacity={0.85}
            >
              {rightLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name={rightIcon!} size={20} color="#fff" />
              )}
            </TouchableOpacity>
          ) : (
            // Spacer sin fondo para mantener el centrado de la marca
            <View style={{ width: 36, height: 36 }} />
          )}
        </View>
      </ImageBackground>

      {/* Avatar circular colgando */}
      {showAvatar && (
        <>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholder]} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 150,
    width: '100%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  topBarImg: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  topBarShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  actionsRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  brandCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  brandIcon: { width: 30, height: 30, resizeMode: 'contain' },
  brandText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignSelf: 'center',
    marginTop: -70, // cuelga debajo del top
    backgroundColor: '#E5E7EB',
  },
  placeholder: {
    backgroundColor: '#E5E7EB',
  },
});
