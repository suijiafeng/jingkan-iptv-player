const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, afterEach } = require("node:test");
require("./register.cjs");
const { en } = require("../src/i18n/en.ts");
const core = require("../src/i18n/core.ts");
const { saveLanguagePreference } = require("../src/i18n/preferences.ts");
const {
  normalizeGroups,
  groupLabel,
  displayGroups,
  channelTitle,
} = require("../src/domain/channelLabels.ts");
const {
  countryLabel,
  languageLabel,
  facetLabel,
  buildFacetOptions,
} = require("../src/domain/channelFacets.ts");
const {
  parseDeclaredQuality,
  qualityName,
} = require("../src/domain/channelSources.ts");
const { daysAgo } = require("../src/domain/timeAgo.ts");
const { parseM3U } = require("../src/domain/m3u.ts");
const {
  resolveRegion,
  regionBasis,
  DEFAULT_COUNTRY_PREFERENCE,
} = require("../src/features/region/policy.ts");
afterEach(() => {
  core.setSystemLanguage("en-US");
  core.setLanguagePreference("system");
});

test("系统语言匹配、回退与手动选择相互独立", () => {
  for (const value of ["zh-CN", "zh-Hant-TW", "ZH_hans", "zh"])
    assert.equal(core.resolveLocale(value), "zh-Hans");
  for (const value of ["en-GB", "de-DE", "ar", "zhx", "", null])
    assert.equal(core.resolveLocale(value), "en");
  assert.equal(core.parseLanguagePreference({ locale: "en" }), "system");
  core.setSystemLanguage("zh-CN");
  assert.equal(core.getLocale(), "zh-Hans");
  core.setLanguagePreference("en");
  core.setSystemLanguage("zh-TW");
  assert.equal(core.getLocale(), "en");
  core.setLanguagePreference("system");
  assert.equal(core.getLocale(), "zh-Hans");
});

test("语言订阅仅在实际设置变化时发布，并可解除", () => {
  let calls = 0;
  const unsubscribe = core.subscribeLanguage(() => {
    calls++;
  });
  core.setLanguagePreference("en");
  core.setLanguagePreference("en");
  assert.equal(calls, 1);
  core.setLanguagePreference("zh-Hans");
  assert.equal(calls, 2);
  unsubscribe();
  core.setLanguagePreference("system");
  assert.equal(calls, 2);
});

test("语言保存失败保持原状态，成功后才切换", async () => {
  core.setLanguagePreference("zh-Hans");
  await assert.rejects(
    saveLanguagePreference(
      {
        setSetting: async () => {
          throw Error("disk full");
        },
      },
      "en",
    ),
  );
  assert.equal(core.getLocale(), "zh-Hans");
  const writes = [];
  await saveLanguagePreference(
    {
      setSetting: async (...args) => {
        writes.push(args);
      },
    },
    "en",
  );
  assert.deepEqual(writes, [["interfaceLanguage", "en"]]);
  assert.equal(core.getLocale(), "en");
});

test("完整句子插值、单复数和未知键回退", () => {
  core.setLanguagePreference("en");
  assert.equal(core.t("{value0} 个频道", { value0: 1 }), "1 channel");
  assert.equal(core.t("{value0} 个频道", { value0: 2 }), "2 channels");
  assert.equal(core.t("{value0} 个频道", { value0: 0 }), "0 channels");
  assert.equal(
    core.t("删除“{value0}”？", { value0: "我的源 $1 {token}" }),
    "Delete “我的源 $1 {token}”?",
  );
  assert.equal(core.t("unknown {value0}", { value0: 1234 }), "unknown 1,234");
  assert.equal(core.t("toString", { value0: 1 }), "toString");
  assert.equal(core.t("__proto__"), "__proto__");
  core.setLanguagePreference("zh-Hans");
  assert.equal(core.t("{value0} 个频道", { value0: 1 }), "1 个频道");
});

test("英文资源保留所有插值，不包含未翻译中文", () => {
  const placeholders = (text) =>
    [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim().length, key);
    assert.deepEqual(placeholders(value), placeholders(key), key);
    assert.ok(!/[\u3400-\u9fff]/.test(value), key);
  }
});

test("界面翻译键均有英文资源", () => {
  const typescript = require("typescript");
  const scan = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "i18n") scan(filename);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const source = typescript.createSourceFile(
        filename,
        fs.readFileSync(filename, "utf8"),
        99,
        true,
      );
      const visit = (node) => {
        if (
          typescript.isCallExpression(node) &&
          node.expression.getText(source) === "t" &&
          typescript.isStringLiteral(node.arguments[0])
        ) {
          assert.ok(
            Object.hasOwn(en, node.arguments[0].text),
            filename + ": " + node.arguments[0].text,
          );
        }
        typescript.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  scan(path.join(process.cwd(), "src"));
});

test("切换语言只改变分类显示，不改变归一化结果或自定义分组", async () => {
  const text =
    '#EXTM3U\n#EXTINF:-1 tvg-id="Demo.cn" group-title="News;我的频道",Demo\nhttps://example.com/live.m3u8';
  core.setLanguagePreference("zh-Hans");
  const chinese = await parseM3U(text);
  assert.equal(normalizeGroups("News;我的频道"), "新闻;我的频道");
  core.setLanguagePreference("en");
  const english = await parseM3U(text);
  assert.deepEqual(english, chinese);
  assert.equal(displayGroups("新闻;我的频道"), "News, 我的频道");
  assert.equal(groupLabel("未分组"), "Ungrouped");
  assert.equal(groupLabel("My News"), "My News");
});

test("国家语言名称、分类和画质随语言显示，内部值不变", () => {
  core.setLanguagePreference("en");
  assert.equal(countryLabel("US"), "United States");
  assert.equal(languageLabel("zh"), "Chinese");
  assert.equal(facetLabel("content", "新闻"), "News");
  assert.equal(qualityName({ qualityLabel: "高清" }), "HD");
  assert.deepEqual(parseDeclaredQuality("HD"), { label: "高清", rank: 720 });
  assert.equal(channelTitle("Demo [Geo-blocked]").tags[0], "Geo-blocked");
  core.setLanguagePreference("zh-Hans");
  assert.equal(countryLabel("US"), "美国");
  assert.equal(languageLabel("zh"), "中文");
  assert.equal(facetLabel("content", "新闻"), "新闻");
});

test("菜单排序随界面语言更新，但选项代码保持一致", () => {
  const channels = [
    { countries: ["US", "CN"], languages: ["en", "zh"], groupName: "新闻" },
  ];
  core.setLanguagePreference("en");
  const english = buildFacetOptions(channels);
  core.setLanguagePreference("zh-Hans");
  const chinese = buildFacetOptions(channels);
  assert.deepEqual(
    [...english.countries].sort(),
    [...chinese.countries].sort(),
  );
  assert.deepEqual(english.contents, chinese.contents);
});

test("已解析的地区状态在切换语言后重新显示，不改变地区判断", () => {
  core.setLanguagePreference("zh-Hans");
  const result = resolveRegion({
    region: "CN",
    timeZone: "Asia/Shanghai",
    language: "en",
  });
  core.setLanguagePreference("en");
  assert.equal(
    regionBasis(DEFAULT_COUNTRY_PREFERENCE, result, "CN"),
    "Based on device region and time zone",
  );
  assert.equal(result.countryCode, "CN");
});

test("相对日期按界面语言显示，跨夏令时按自然日计算", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const now = new Date(2026, 2, 9, 12).getTime();
    const yesterday = new Date(2026, 2, 8, 0, 10).getTime();
    core.setLanguagePreference("en");
    assert.equal(daysAgo(yesterday, now), "yesterday");
    core.setLanguagePreference("zh-Hans");
    assert.equal(daysAgo(yesterday, now), "昨天");
    assert.equal(daysAgo(now, now), "今天");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("Expo 原生语言资源可解析为双平台应用名称", async () => {
  const {
    getResolvedLocalesAsync,
  } = require("@expo/config-plugins/build/utils/locales");
  const configuration = require("../app.json").expo;
  for (const platform of ["android", "ios"]) {
    const { localesMap } = await getResolvedLocalesAsync(
      process.cwd(),
      configuration.locales,
      platform,
    );
    const key = platform === "ios" ? "CFBundleDisplayName" : "app_name";
    assert.equal(localesMap.en[key], "Jingkan TV");
    assert.equal(localesMap["zh-Hans"][key], "静看 TV");
  }
});
