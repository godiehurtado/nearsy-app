// src/navigation/HomeStack.tsx
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainHomeScreen from '../screens/MainHomeScreen';
import NearbySearchScreen from '../screens/NearbySearchScreen';
import ProfileDetailScreen from '../screens/ProfileDetailScreen';
import DiscoveryProfileScreen from '../screens/DiscoveryProfileScreen';
import ProfileGalleryScreen from '../screens/ProfileGalleryScreen';
import LiveLocationTracker from '../components/LiveLocationTracker';

export type HomeStackParamList = {
  MainHome: undefined;
  NearbySearch: undefined;
  ProfileDetail: { uid: string };
  DiscoveryProfile: { uid: string };
  ProfileGallery: { uid: string; mode?: 'personal' | 'professional' };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <View style={{ flex: 1 }}>
      <LiveLocationTracker />
      <Stack.Navigator
        id="HomeStack"
        initialRouteName="MainHome"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="MainHome" component={MainHomeScreen} />
        <Stack.Screen name="NearbySearch" component={NearbySearchScreen} />
        <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
        <Stack.Screen
          name="DiscoveryProfile"
          component={DiscoveryProfileScreen}
        />
        <Stack.Screen name="ProfileGallery" component={ProfileGalleryScreen} />
      </Stack.Navigator>
    </View>
  );
}
