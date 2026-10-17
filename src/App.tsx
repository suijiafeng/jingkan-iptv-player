import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Heading, Notice } from "./components/ui";
import { openRepository, type Repository } from "./data/repository";
import type { Channel } from "./domain/types";
import { colors, styles } from "./theme";

export default function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void openRepository()
      .then(async (database) => {
        const rows = await database.listChannels();
        if (active) { setRepo(database); setChannels(rows); }
      })
      .catch(() => { if (active) setError("读取本地资料失败，请重试"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Heading title="静看" subtitle="本地频道资料" />
        {error ? <Notice title={error} error /> : null}
        {loading ? <ActivityIndicator color={colors.accent} /> :
          <Button label="重新读取本地资料" secondary onPress={() => setAttempt((value) => value + 1)} />}
      </View>
      {repo && <FlatList data={channels} keyExtractor={(channel) => channel.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => <Text style={styles.body}>{item.name}</Text>}
        ListEmptyComponent={<Notice title="还没有频道" body="本地数据库已经准备完成。" />} />}
    </SafeAreaView>
  );
}
