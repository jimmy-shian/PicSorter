// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Reanimated shared values are designed to be mutated in worklets and gesture callbacks (.value = ...)
      "react-hooks/immutability": "off",
    },
  },
]);
