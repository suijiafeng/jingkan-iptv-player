import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { Button, Card, Heading, Notice } from "./components/ui";
import { openRepository, type Repository } from "./data/repository";
import { readPickedFile, ImportIOError } from "./data/importIO";
import { parseM3U, M3UParseError } from "./domain/m3u";
import type { Channel, ImportPreview, SourceKind } from "./domain/types";
import { colors, styles } from "./theme";

type Prepared = { kind: SourceKind; location: string; content?: string; preview: ImportPreview };

export default function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") controller.current?.abort();
    });
    return () => { mounted.current = false; controller.current?.abort(); subscription.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void openRepository().then(async (database) => {
      if (active) setRepo(database);
    }).catch(() => { if (active) setError("本地资料打开失败，请重试"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!repo) return;
    let active = true;
    void repo.listChannels()
      .then((rows) => { if (active) setChannels(rows); })
      .catch(() => { if (active) setError("读取频道失败，请重试"); });
    return () => { active = false; };
  }, [repo, revision]);

  const chooseFile = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    const request = new AbortController();
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["audio/x-mpegurl", "application/vnd.apple.mpegurl", "text/plain", "application/octet-stream"],
        copyToCacheDirectory: true, multiple: false,
      });
      if (picked.canceled || !mounted.current || request.signal.aborted) return;
      const asset = picked.assets[0];
      controller.current = request;
      const content = await readPickedFile(asset.uri, request.signal);
      const preview = await parseM3U(content, { signal: request.signal });
      if (!mounted.current || request.signal.aborted) return;
      setPrepared({ kind: "file", location: asset.name, content, preview });
      setName((value) => value || asset.name);
    } catch (cause) {
      if (mounted.current && !request.signal.aborted) setError(
        cause instanceof M3UParseError || cause instanceof ImportIOError ? cause.message : "文件读取失败，请选择有效 UTF-8 M3U 文件",
      );
    } finally {
      if (controller.current === request) controller.current = null;
      operation.current = false; if (mounted.current) setBusy(false);
    }
  };

  const save = async () => {
    if (!repo || !prepared || operation.current) return;
    operation.current = true; setBusy(true); setError("");
    const snapshot = prepared;
    try {
      const sourceName = name.trim() || (snapshot.kind === "file" ? snapshot.location : new URL(snapshot.location).hostname);
      await repo.importSource({ ...snapshot, name: sourceName });
      if (!mounted.current) return;
      setPrepared(null); setName("");
      setRevision((value) => value + 1);
    } catch { if (mounted.current) setError("保存失败，旧数据未改变，请重试"); }
    finally { operation.current = false; if (mounted.current) setBusy(false); }
  };

  if (!repo) return <SafeAreaView style={styles.screen}><View style={styles.content}>
    <Heading title="静看" subtitle="只留下你想看的频道" />
    {error ? <Notice title={error} error /> : null}
    {loading ? <ActivityIndicator color={colors.accent} /> : <Button label="重新打开本地资料" onPress={() => setAttempt((value) => value + 1)} />}
  </View></SafeAreaView>;
  const header = <View style={{ gap: 12, marginBottom: 12 }}>
    <Heading title="静看" subtitle="导入自己的节目单" />
    {error ? <Notice title={error} error /> : null}
    <Button label={busy ? "正在处理…" : "从文件导入"} secondary disabled={busy} onPress={() => void chooseFile()} />
    {prepared && <Card>
      <TextInput accessibilityLabel="来源名称" placeholder="来源名称，可留空" placeholderTextColor={colors.muted}
        style={styles.input} value={name} editable={!busy} onChangeText={setName} />
      <Notice title={`${prepared.preview.stats.valid} 个可导入频道`}
        body={`${prepared.preview.stats.duplicates} 条重复 · ${prepared.preview.stats.ignored} 条忽略 · ${prepared.preview.stats.http} 个 HTTP 频道`} />
      {prepared.preview.channels.slice(0, 6).map((channel) => <Text key={channel.identityKey} style={styles.body}>{channel.name}</Text>)}
      {prepared.preview.channels.length > 6 && <Text style={styles.muted}>以上为前 6 个频道，保存时导入全部有效频道。</Text>}
      <Button label="保存节目单" disabled={busy} onPress={() => void save()} />
      <Button label="放弃本次预览" secondary disabled={busy} onPress={() => setPrepared(null)} />
    </Card>}
  </View>;
  return <SafeAreaView style={styles.screen}>
    <FlatList data={channels} keyExtractor={(channel) => channel.id} ListHeaderComponent={header}
      contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListEmptyComponent={<Notice title="还没有频道" body="导入节目单后，频道资料会保存在本机。" />}
      renderItem={({ item }) => <Card><Text style={styles.heading}>{item.name}</Text><Text style={styles.muted}>{item.groupName} · {item.sourceName}</Text></Card>} />
  </SafeAreaView>;
}
