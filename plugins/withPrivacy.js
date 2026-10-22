const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

// 在 Android 12+（targetSdk >= 31）上，allowBackup=false 只会阻止云备份；
// 设备间迁移（例如 Samsung Smart Switch）遵循
// dataExtractionRules。两套规则均排除全部存储域，避免含有
// 令牌、文件来源及观看记录绝不离开本设备。
const DOMAINS = [
  "root",
  "file",
  "database",
  "sharedpref",
  "external",
  "device_root",
  "device_file",
  "device_database",
  "device_sharedpref",
];
const excludeAll = (indent) =>
  DOMAINS.map(
    (domain) => `${indent}<exclude domain="${domain}" path="." />`,
  ).join("\n");
const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${excludeAll("    ")}
  </cloud-backup>
  <device-transfer>
${excludeAll("    ")}
  </device-transfer>
</data-extraction-rules>
`;
// Android 11 及更早版本读取 fullBackupContent，其中没有 device_* 域。
const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${DOMAINS.filter((domain) => !domain.startsWith("device_"))
  .map((domain) => `  <exclude domain="${domain}" path="." />`)
  .join("\n")}
</full-backup-content>
`;

const withBackupRuleFiles = (config) =>
  withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "jingkan_data_extraction_rules.xml"),
        DATA_EXTRACTION_RULES,
      );
      fs.writeFileSync(
        path.join(dir, "jingkan_backup_rules.xml"),
        FULL_BACKUP_CONTENT,
      );
      return config;
    },
  ]);

module.exports = (config) =>
  withBackupRuleFiles(
    withAndroidManifest(config, (config) => {
      const application = config.modResults.manifest.application[0];
      const app = application.$;
      app["android:allowBackup"] = "false";
      app["android:dataExtractionRules"] = "@xml/jingkan_data_extraction_rules";
      app["android:fullBackupContent"] = "@xml/jingkan_backup_rules";
      // HTTP 是 v0.2 明确支持的能力，使用前必须取得应用内知情许可。
      app["android:usesCleartextTraffic"] = "true";
      return config;
    }),
  );
module.exports.DATA_EXTRACTION_RULES = DATA_EXTRACTION_RULES;
module.exports.FULL_BACKUP_CONTENT = FULL_BACKUP_CONTENT;
