// src/navigation/HomeStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainHomeScreen from '../screens/MainHomeScreen';
import NearbySearchScreen from '../screens/NearbySearchScreen';
import ProfileDetailScreen from '../screens/ProfileDetailScreen';
import ProfileGalleryScreen from '../screens/ProfileGalleryScreen';
import LiveLocationTracker from '../components/LiveLocationTracker';

export type HomeStackParamList = {
  MainHome: undefined;
  NearbySearch: undefined;
  ProfileDetail: { uid: string };
  ProfileGallery: { uid: string; mode?: 'personal' | 'professional' };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <>
      <LiveLocationTracker />
      <Stack.Navigator
        initialRouteName="MainHome"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="MainHome" component={MainHomeScreen} />
        <Stack.Screen name="NearbySearch" component={NearbySearchScreen} />
        <Stack.Screen name="ProfileDetail" component={ProfileDetailScreen} />
        <Stack.Screen name="ProfileGallery" component={ProfileGalleryScreen} />
      </Stack.Navigator>
    </>
  );
}
