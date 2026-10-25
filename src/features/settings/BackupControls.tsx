import React, { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { StorageAccessFramework, deleteAsync } from "expo-file-system/legacy";
import type { Repository } from "../../data/repository";
import { BackupError, MAX_BACKUP_BYTES, parseBackup } from "../../data/backup";
import { confirm } from "../common/confirm";
import { RowAction, SettingRow } from "./SettingRows";
import { SettingIcon } from "./SettingIcon";

/** 一行备份设置：末尾提供“导出”和“恢复”，结果显示在下方。 */
export function BackupControls({
  repo,
  onRestore,
}: {
  repo: Repository;
  onRestore: (text: string) => Promise<void>;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (error) {
      setMessage(
        error instanceof BackupError ? error.message : "备份操作未完成，请重试",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const exportFile = () =>
    run(async () => {
      if (
        !(await confirm(
          "导出本机备份？",
          "备份文件未加密，含节目源完整地址与令牌、本地节目单、收藏和播放偏好，请妥善保管，勿分享给他人。观看记录与各项许可不导出。",
          "选择保存目录",
        ))
      )
        return;
      const permission =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;
      const text = await repo.exportBackup();
      const uri = await StorageAccessFramework.createFileAsync(
        permission.directoryUri,
        `jingkan-backup-${Date.now()}.json`,
        "application/json",
      );
      try {
        await StorageAccessFramework.writeAsStringAsync(uri, text);
      } catch (error) {
        try {
          await deleteAsync(uri, { idempotent: true });
        } catch {
          /* 文件提供方可能拒绝清理未写完的文件。 */
        }
        throw error;
      }
      setMessage("备份已保存");
    });
  const restoreFile = () =>
    run(async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0],
        file = new File(asset.uri);
      try {
        if (!file.exists || file.size > MAX_BACKUP_BYTES)
          throw new BackupError("文件无法打开或超过 32 MB");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          await file.bytes(),
        );
        const backup = parseBackup(text);
        if (
          !(await confirm(
            "用备份替换本机资料？",
            `将用 ${backup.sources.length} 份节目单、${backup.favorites.length} 个收藏替换本机全部资料（含观看记录与设置），建议先导出。恢复后需重新允许联网、台标与地区识别。`,
            "替换并恢复",
          ))
        )
          return;
        await onRestore(text);
        setMessage("已恢复，联网许可已重置");
      } finally {
        try {
          if (file.exists) file.delete();
        } catch {
          /* 只处理文件选择器的缓存副本。 */
        }
      }
    });
  return (
    <SettingRow
      title="备份"
      icon={<SettingIcon name="backup" />}
      caption={busy ? "正在处理备份…" : message || undefined}
      trailing={
        <View style={backupStyles.actions}>
          <RowAction
            label="导出"
            accessibilityLabel="导出备份"
            disabled={busy}
            onPress={() => void exportFile()}
          />
          <RowAction
            label="恢复"
            accessibilityLabel="从备份恢复"
            disabled={busy}
            onPress={() => void restoreFile()}
          />
        </View>
      }
    />
  );
}

const backupStyles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8 },
});
