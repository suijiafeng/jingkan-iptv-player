const { withAppBuildGradle } = require("expo/config-plugins");

// 正式签名来自 Gradle 属性（~/.gradle/gradle.properties），
// 或环境变量读取，绝不从仓库读取。未配置时，发布构建
// 构建会退回调试密钥并显示醒目警告；传入
// 若希望缺少签名时构建失败，传入 -PjingkanRequireReleaseKey=true（用于需要保留的构建）。
const HEADER = `// jingkan: release signing (plugins/withReleaseSigning.js)
def jingkanProp = { String name -> findProperty(name) ?: System.getenv(name) }
def jingkanSigning = [
    storeFile    : jingkanProp('JINGKAN_UPLOAD_STORE_FILE'),
    storePassword: jingkanProp('JINGKAN_UPLOAD_STORE_PASSWORD'),
    keyAlias     : jingkanProp('JINGKAN_UPLOAD_KEY_ALIAS'),
    keyPassword  : jingkanProp('JINGKAN_UPLOAD_KEY_PASSWORD'),
]
def jingkanHasReleaseKey = jingkanSigning.values().every { it }
`;
const RELEASE_CONFIG = `
        if (jingkanHasReleaseKey) {
            release {
                storeFile file(jingkanSigning.storeFile)
                storePassword jingkanSigning.storePassword
                keyAlias jingkanSigning.keyAlias
                keyPassword jingkanSigning.keyPassword
            }
        }`;
const RELEASE_SELECT = `if (jingkanHasReleaseKey) {
                signingConfig signingConfigs.release
            } else if ((findProperty('jingkanRequireReleaseKey') ?: 'false').toBoolean()) {
                throw new GradleException("Release key required: set JINGKAN_UPLOAD_STORE_FILE, JINGKAN_UPLOAD_STORE_PASSWORD, JINGKAN_UPLOAD_KEY_ALIAS and JINGKAN_UPLOAD_KEY_PASSWORD (see scripts/create-release-keystore.sh).")
            } else {
                logger.warn("jingkan: no release key configured; this release APK is signed with the DEBUG key (testing only, cannot upgrade a release-signed install).")
                signingConfig signingConfigs.debug
            }`;

function apply(contents) {
  if (contents.includes("jingkan: release signing")) return contents;
  const androidBlock = contents.indexOf("\nandroid {");
  const debugConfig = /(signingConfigs \{\s*debug \{[^}]*\})/;
  const releaseSigning =
    /(release \{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/;
  if (
    androidBlock < 0 ||
    !debugConfig.test(contents) ||
    !releaseSigning.test(contents)
  )
    throw new Error(
      "withReleaseSigning: app/build.gradle layout changed; update the plugin.",
    );
  return (
    contents.slice(0, androidBlock + 1) +
    HEADER +
    contents.slice(androidBlock + 1)
  )
    .replace(debugConfig, `$1${RELEASE_CONFIG}`)
    .replace(releaseSigning, `$1${RELEASE_SELECT}`);
}

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    config.modResults.contents = apply(config.modResults.contents);
    return config;
  });
module.exports.apply = apply;
