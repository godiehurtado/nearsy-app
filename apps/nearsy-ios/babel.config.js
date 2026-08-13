module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            idb: '../../packages/shared/src/shims/idb.js',

            // I1: allow RNFB app / app-check / functions on iOS.
            // Keep Auth / Firestore / Storage on Firebase JS — hard-block those RNFB modules.
            '@react-native-firebase/auth':
              '../../packages/shared/src/shims/emptyFirebase.js',
            '@react-native-firebase/firestore':
              '../../packages/shared/src/shims/emptyFirebase.js',
            '@react-native-firebase/storage':
              '../../packages/shared/src/shims/emptyFirebase.js',
          },
        },
      ],
      // si usas reanimated, esto debe ir al final:
      'react-native-reanimated/plugin',
    ],
  };
};
