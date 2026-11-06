const fs = require("node:fs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const typescript = require("typescript");

// 直接执行项目源码；仅转换 TypeScript，不加载 React Native 原生模块。
require.extensions[".ts"] = (loadedModule, filename) => {
  const { outputText } = typescript.transpileModule(
    fs.readFileSync(filename, "utf8"),
    {
      compilerOptions: {
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
    },
  );
  loadedModule._compile(outputText, filename);
};
const { Repository } = require("../src/data/channelRepository.ts");
const { parseM3U } = require("../src/domain/m3u.ts");
const { parseBackup } = require("../src/data/backup.ts");

async function createFixture(context, logoUrl = null) {
  const database = new DatabaseSync(":memory:");
  context.after(() => database.close());
  const adapter = {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, params = []) {
      return database.prepare(sql).run(...params);
    },
    async getFirstAsync(sql, params = []) {
      return database.prepare(sql).get(...params) ?? null;
    },
    async getAllAsync(sql, params = []) {
      return database.prepare(sql).all(...params);
    },
    async withExclusiveTransactionAsync(task) {
      database.exec("BEGIN IMMEDIATE");
      try {
        await task(adapter);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  let sequence = 0;
  const repository = new Repository(adapter, {
    makeId: () => String(++sequence),
  });
  await repository.initialize();
  const playlist = `#EXTM3U\n#EXTINF:-1 tvg-id="Demo.cn"${logoUrl === null ? "" : ` tvg-logo="${logoUrl}"`},Demo\nhttps://example.com/live.m3u8\n`;
  const preview = await parseM3U(playlist);
  await repository.importSource({
    name: "Demo",
    kind: "url",
    location: "https://example.com/list.m3u",
    preview,
  });
  const channel = (await repository.listChannels())[0];
  await repository.toggleFavorite(channel.id);
  return { repository, channel };
}

for (const logoUrl of [
  null,
  "/images/logo.png",
  "http://192.168.1.2/logo.png",
  "javascript:alert(1)",
  "https://example.com/logo.png",
]) {
  test(`备份往返保留频道和收藏，兼容台标 ${logoUrl}`, async (context) => {
    const { repository, channel } = await createFixture(context, logoUrl);
    const text = await repository.exportBackup();
    assert.equal(JSON.parse(text).preferences.skipUnreachable, true);
    assert.equal(JSON.parse(text).preferences.swipeReverse, false);
    const expectedLogo =
      logoUrl === "https://example.com/logo.png" ? logoUrl : null;
    assert.equal(JSON.parse(text).channels[0].logoUrl, expectedLogo);
    // 导出只处理快照，不改动设备上的原资料。
    assert.equal((await repository.getChannel(channel.id)).logoUrl, logoUrl);
    await repository.clearAll();
    await repository.restoreBackup(text);
    const restored = (await repository.listFavorites())[0];
    assert.equal(restored.id, channel.id);
    assert.equal(restored.streamUrl, channel.streamUrl);
    assert.equal(restored.logoUrl, expectedLogo);
  });
}

test("旧备份中的无效台标可恢复，非字符串台标仍拒绝", async (context) => {
  const { repository } = await createFixture(context);
  const backup = JSON.parse(await repository.exportBackup());
  backup.channels[0].logoUrl = "/old/logo.png";
  await repository.restoreBackup(JSON.stringify(backup));
  assert.equal((await repository.listFavorites())[0].logoUrl, null);
  backup.channels[0].logoUrl = { uri: "https://example.com/logo.png" };
  assert.throws(() => parseBackup(JSON.stringify(backup)));
});

test("不安全播放地址仍拒绝，恢复失败保留原资料", async (context) => {
  const { repository, channel } = await createFixture(context);
  const before = await repository.exportBackup();
  const backup = JSON.parse(before);
  backup.channels[0].streamUrl = "http://127.0.0.1/live.m3u8";
  await assert.rejects(repository.restoreBackup(JSON.stringify(backup)));
  const after = (await repository.listFavorites())[0];
  assert.equal(after.id, channel.id);
  assert.equal(after.streamUrl, channel.streamUrl);
});

for (const streamUrl of [
  "https://example.com/live.m3u8?token=abc$def",
  "https://example.com/live.m3u8?token=abc%24def",
  "https://example.com/live.m3u8?token=abc$def&quality=hd",
  "https://example.com/live.m3u8#token=abc$def",
]) {
  test(`TXT 完整保留认证参数及片段 ${streamUrl}`, async () => {
    const preview = await parseM3U(`Demo,${streamUrl}`);
    assert.equal(preview.channels[0].streamUrl, streamUrl);
  });
}

test("TXT 仍支持无参数线路备注与多地址", async () => {
  const preview = await parseM3U(
    "Demo,https://example.com/a.m3u8$线路一#https://example.com/b.m3u8$线路二",
  );
  assert.deepEqual(
    preview.channels.map((channel) => channel.streamUrl),
    ["https://example.com/a.m3u8", "https://example.com/b.m3u8"],
  );
});

test("TXT 多地址分别保留查询令牌和移除无参数备注", async () => {
  const preview = await parseM3U(
    "Demo,https://example.com/a.m3u8?token=abc$def#https://example.com/b.m3u8$线路二",
  );
  assert.deepEqual(
    preview.channels.map((channel) => channel.streamUrl),
    ["https://example.com/a.m3u8?token=abc$def", "https://example.com/b.m3u8"],
  );
});
