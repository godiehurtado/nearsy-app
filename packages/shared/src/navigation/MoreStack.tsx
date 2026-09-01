// src/navigation/MoreStack.tsx
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MoreScreen from '../screens/MoreScreen';
import DeleteAccountScreen from '../screens/DeleteAccountScreen';
import BlockedPeopleScreen from '../screens/BlockedPeopleScreen';

export type MoreStackParamList = {
  MoreHome: undefined;
  BlockedPeople: undefined;
  DeleteAccount: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export default function MoreStack() {
  return (
    <Stack.Navigator id="MoreStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MoreHome" component={MoreScreen} />
      <Stack.Screen name="BlockedPeople" component={BlockedPeopleScreen} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    </Stack.Navigator>
  );
}
