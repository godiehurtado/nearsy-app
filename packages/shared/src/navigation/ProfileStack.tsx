// src/navigation/ProfileStack.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SocialMediaScreen from '../screens/SocialMediaScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import InterestsScreen from '../screens/InterestsScreen';
import GalleryScreen from '../screens/GalleryScreen';
import AffiliationsScreen from '../screens/AffiliationsScreen';

export type ProfileStackParamList = {
  CompleteProfile: undefined; // armar perfil general
  Interests: {
    mode: 'personal' | 'professional';
  };
  Gallery: {
    uid?: string;
    mode?: 'personal' | 'professional';
  };

  Affiliations: {
    uid?: string;
    mode?: 'personal' | 'professional';
  };

  SocialMedia: {
    uid?: string;
    mode?: 'personal' | 'professional';
  };
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator
      id="ProfileStack"
      initialRouteName="CompleteProfile"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      <Stack.Screen name="SocialMedia" component={SocialMediaScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="Gallery" component={GalleryScreen} />
      <Stack.Screen name="Affiliations" component={AffiliationsScreen} />
    </Stack.Navigator>
  );
}
