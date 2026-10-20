import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import type { Channel } from "../../domain/types";
import { qualityName } from "../../domain/channelSources";
import { displayStreamAddress } from "../../domain/url";
import { daysAgo } from "../../domain/timeAgo";

export function SourceList({
  current,
  sources,
  onSelect,
}: {
  current: Channel;
  sources: Channel[];
  onSelect: (source: Channel) => void;
}) {
  // 按天计算：以列表打开时的时间为基准已足够精确。
  const [now] = useState(() => Date.now());
  // 只有一份节目单时，每行重复来源名称没有意义。
  const manySources =
    new Set(sources.map((source) => source.sourceName)).size > 1;
  return (
    <View
      style={styles.sourceList}
      accessibilityRole="list"
      testID="source-list"
    >
      {sources.map((source) => {
        const selected = source.id === current.id;
        return (
          <Pressable
            key={source.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${qualityName(source)}${manySources ? `，${source.sourceName}` : ""}${selected ? "，当前来源" : ""}`}
            style={({ pressed }) => [
              styles.sourceRow,
              selected && styles.sourceRowSelected,
              pressed && styles.pressed,
            ]}
            onPress={() => onSelect(source)}
          >
            <Text
              style={[styles.sourceText, selected && styles.accent]}
              numberOfLines={1}
            >
              {selected ? "●" : "○"} {qualityName(source)}
              {manySources ? ` · ${source.sourceName}` : ""}
            </Text>
            {/* 完整地址，但隐藏查询参数；其中常含访问令牌。 */}
            <Text style={styles.sourceAddress} numberOfLines={3}>
              {displayStreamAddress(source.streamUrl)}
            </Text>
            {source.checkStatus === "unreachable" && (
              // 点击行会开始播放，本身就相当于一次新检测。
              <Text style={styles.sourceWarning}>
                {daysAgo(source.checkedAt, now) || "上次"}测试未连通 ·
                点选可再试
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  accent: { color: colors.accent },
  pressed: { opacity: 0.7 },
  sourceList: { gap: 4 },
  sourceRow: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.raised,
  },
  sourceRowSelected: { borderColor: colors.accent },
  sourceText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  sourceAddress: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  sourceWarning: { color: colors.warn, fontSize: 11, lineHeight: 16 },
});
