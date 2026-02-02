import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import { View, Text } from 'react-native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ProfileStack from './ProfileStack';
import MoreScreen from '../screens/MoreScreen';
import AlertsScreen from '../screens/AlertsScreen';
import type { HomeStackParamList } from './HomeStack';
import type { ProfileStackParamList } from './ProfileStack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 👇 importa el hook
import { useNearbyAlerts } from '../hooks/useNearbyAlerts';

function Placeholder({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{label}</Text>
    </View>
  );
}

export type RootTabsParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  Alerts: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<RootTabsParamList>();

export default function RootTabs() {
  const insets = useSafeAreaInsets();

  // 👇 usamos el hook aquí para saber cuántas alerts hay
  const { alerts } = useNearbyAlerts();
  const alertsCount = alerts.length;
  const alertsBadge =
    alertsCount > 0 ? (alertsCount > 9 ? '9+' : alertsCount) : undefined;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E3A8A',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
        },
        tabBarIcon: ({ focused, color, size }) => {
          const s = size + (focused ? 2 : 0);
          switch (route.name) {
            case 'Home':
              return (
                <Ionicons
                  name={focused ? 'home' : 'home-outline'}
                  size={s}
                  color={color}
                />
              );
            case 'Profile':
              return (
                <Ionicons
                  name={focused ? 'person' : 'person-outline'}
                  size={s}
                  color={color}
                />
              );
            case 'Alerts':
              return (
                <Ionicons
                  name={focused ? 'notifications' : 'notifications-outline'}
                  size={s}
                  color={color}
                />
              );
            case 'More':
              return (
                <Ionicons
                  name={focused ? 'apps' : 'apps-outline'}
                  size={s}
                  color={color}
                />
              );
            default:
              return null;
          }
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.navigate('Home', { screen: 'MainHome' });
          },
        })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.navigate('Profile', { screen: 'CompleteProfile' });
          },
        })}
      />

      {/* 👇 aquí aplicamos el badge solo a Alerts */}
      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarBadge: alertsBadge,
        }}
      />

      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}
