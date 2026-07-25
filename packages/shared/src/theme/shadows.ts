import { Platform } from 'react-native';

// Soft elevation used for cards / floating action rows.
export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0A1330',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  android: { elevation: 4 },
  default: {},
});

export const subtleShadow = Platform.select({
  ios: {
    shadowColor: '#0A1330',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  android: { elevation: 2 },
  default: {},
});
