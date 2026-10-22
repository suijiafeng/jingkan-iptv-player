const fs = require("node:fs");
const path = require("node:path");

const files = ["app.json", "package.json", "package-lock.json"];

function prepareVersion(root) {
  const entries = files.map((name) => {
    const filename = path.join(root, name);
    const original = fs.readFileSync(filename, "utf8");
    return { name, filename, original, value: JSON.parse(original) };
  });
  const [app, pkg, lock] = entries.map((entry) => entry.value);
  const version = app.expo.version;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  const code = app.expo.android.versionCode;
  if (
    !match ||
    pkg.version !== version ||
    lock.version !== version ||
    lock.packages?.[""]?.version !== version ||
    !Number.isSafeInteger(code) ||
    code < 1 ||
    code >= 2100000000
  )
    throw new Error("版本配置不一致、格式无效或 Android 构建号已达上限。");
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger) || !Number.isSafeInteger(parts[2] + 1))
    throw new Error("版本号超出安全整数范围。");
  const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  app.expo.version =
    pkg.version =
    lock.version =
    lock.packages[""].version =
      nextVersion;
  app.expo.android.versionCode = code + 1;
  for (const entry of entries)
    entry.updated = JSON.stringify(entry.value, null, 2) + "\n";

  const restore = () => {
    for (const entry of entries) {
      const current = fs.readFileSync(entry.filename, "utf8");
      if (current !== entry.updated && current !== entry.original)
        throw new Error(
          `版本恢复已停止：${entry.name} 被其他操作修改，请人工核对。`,
        );
    }
    for (const entry of entries)
      fs.writeFileSync(entry.filename, entry.original);
  };
  return {
    version: nextVersion,
    versionCode: code + 1,
    snapshot: Object.fromEntries(
      entries.map((entry) => [entry.name, entry.value]),
    ),
    apply() {
      try {
        for (const entry of entries)
          fs.writeFileSync(entry.filename, entry.updated);
      } catch (error) {
        restore();
        throw error;
      }
    },
    verify() {
      for (const entry of entries)
        if (fs.readFileSync(entry.filename, "utf8") !== entry.updated)
          throw new Error(`构建期间版本配置发生变化：${entry.name}`);
    },
    restore,
  };
}
module.exports = { prepareVersion };
