import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeStack from './HomeStack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ProfileStack from './ProfileStack';
import MoreStack from './MoreStack';
import type { MoreStackParamList } from './MoreStack';
import AlertsScreen from '../screens/AlertsScreen';
import type { HomeStackParamList } from './HomeStack';
import type { ProfileStackParamList } from './ProfileStack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  NearbyAlertsProvider,
  useNearbyAlerts,
} from '../hooks/NearbyAlertsContext';

export type RootTabsParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  Alerts: undefined;
  More: NavigatorScreenParams<MoreStackParamList>;
};

const Tab = createBottomTabNavigator<RootTabsParamList>();

function RootTabsContent() {
  const insets = useSafeAreaInsets();
  const { alerts } = useNearbyAlerts();
  const alertsCount = alerts.length;
  const alertsBadge =
    alertsCount > 0 ? (alertsCount > 9 ? '9+' : alertsCount) : undefined;

  return (
    <Tab.Navigator
      id="RootTabs"
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
          tabPress: (e) => {
            (e as unknown as { preventDefault: () => void }).preventDefault();
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

      <Tab.Screen
        name="Alerts"
        component={AlertsScreen}
        options={{
          tabBarBadge: alertsBadge,
        }}
      />

      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

export default function RootTabs() {
  return (
    <NearbyAlertsProvider>
      <RootTabsContent />
    </NearbyAlertsProvider>
  );
}
