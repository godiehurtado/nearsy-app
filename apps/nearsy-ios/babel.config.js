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

            // ✅ hard-block RNFirebase in iOS
            '@react-native-firebase/app':
              '../../packages/shared/src/shims/emptyFirebase.js',
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
