/**
 * Consumes a pending OneLink destination (contract nc1, C6) once the main tabs
 * are mounted: signed in and past onboarding/CRJ. Navigation only: existing tabs,
 * no parameters, no action. The store drops expired, duplicate or foreign-account
 * entries before they get here.
 */
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';

import { onOneLinkDestination, takeOneLinkDestination } from '../attribution/appsflyer';
import type { OneLinkDestination } from '../attribution/oneLinkContract';
import { firebaseAuth } from '../config/firebaseConfig';

const TARGETS: Record<OneLinkDestination, { screen: string; params?: object }> = {
  home: { screen: 'Home', params: { screen: 'MainHome' } },
  profile: { screen: 'Profile', params: { screen: 'CompleteProfile' } },
  alerts: { screen: 'Alerts' },
};

export function useOneLinkDestination(): void {
  const navigation = useNavigation();
  useEffect(() => {
    let active = true;
    const consume = () => {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) return;
      void takeOneLinkDestination(uid)
        .then((destination) => {
          if (!active || !destination) return;
          (navigation as unknown as { navigate: (name: string, params: object) => void }).navigate(
            'MainTabs',
            TARGETS[destination],
          );
        })
        .catch(() => {});
    };
    consume();
    const unsubscribe = onOneLinkDestination(consume);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigation]);
}
