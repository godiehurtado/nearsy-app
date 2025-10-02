module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // 👇 Reanimated plugin SIEMPRE al final
    plugins: ['react-native-reanimated/plugin'],
  };
};
