// src/navigation/AppNavigator.tsx
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import PhoneVerificationScreen from '../screens/PhoneVerificationScreen';
import RootTabs from './RootTabs';

// 👇 DEFINIMOS los params de cada pantalla
export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  CompleteProfile:
    | {
        uid: string;
        email?: string | null;
      }
    | undefined; // por si vienes de otros flujos y quieres que se resuelva con auth().currentUser
  MainTabs: undefined;
  PhoneVerification: {
    uid: string;
    phone: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="Login"
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
      <Stack.Screen name="MainTabs" component={RootTabs} />
      <Stack.Screen
        name="PhoneVerification"
        component={PhoneVerificationScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
