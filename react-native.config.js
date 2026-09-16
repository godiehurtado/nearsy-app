// react-native.config.js
module.exports = {
  dependencies: {
    '@react-native-firebase/auth': {
      platforms: {
        ios: null, // ❌ No linkear nativo en iOS
      },
    },
  },
};
