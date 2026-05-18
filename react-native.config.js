// react-native.config.js
const path = require('path');

module.exports = {
  project: {
    android: {
      sourceDir: path.join(__dirname, 'apps/nearsy-android/android'),
      appName: 'app',
      packageName: 'com.nearsy.app',
    },
  },
  dependencies: {
    '@react-native-firebase/auth': {
      platforms: {
        ios: null,
      },
    },
  },
};
