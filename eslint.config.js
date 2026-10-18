const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: ["android/**", "dist/**", "coverage/**", ".claude/**"],
  },
  {
    // 名称应说明变量保存的内容；不使用单字母标识符，包括
    // 循环计数器、回调参数和样式表。
    rules: {
      "id-length": ["error", { min: 2, properties: "never" }],
    },
  },
]);
