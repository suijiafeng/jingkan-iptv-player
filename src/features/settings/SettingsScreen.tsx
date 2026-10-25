import React from "react";
import { ScrollView, Switch } from "react-native";
import { Button, Heading } from "../../components/ui";
import { colors, styles } from "../../theme";
import { Chevron, SettingRow, SettingSection } from "./SettingRows";
import type { Repository } from "../../data/repository";
import { BackupControls } from "./BackupControls";
import { About } from "./About";
import { MINI_WINDOW_SPACE } from "../home/useFloatingWindow";

interface Props {
  repo?: Repository | null;
  onRestoreBackup?: (text: string) => Promise<void>;
  /** 显示在“管理节目来源”下方；来源未知时省略。 */
  sourceCount?: number;
  remoteAllowed: boolean;
  revokePending: boolean;
  mobileWarning: boolean;
  backgroundPlayback?: boolean;
  backgroundSaving?: boolean;
  onBackgroundPlaybackChange?: (value: boolean) => void;
  artworkAllowed: boolean;
  artworkSaving: boolean;
  artworkRevokePending: boolean;
  onRetryArtworkRevoke: () => void;
  onArtworkChange: (value: boolean) => void;
  onManageSources: () => void;
  onRevoke: () => void;
  onAllowRemote: () => void;
  onMobileWarningChange: (value: boolean) => void;
  miniPlayer: boolean;
  onMiniPlayerChange: (value: boolean) => void;
  onClearAll: () => void;
  /** 停靠播放器以小窗形式悬浮在页面底部上方。 */
  reserveMiniBar?: boolean;
}

export function SettingsScreen(props: Props) {
  const artworkDisabled =
    props.artworkSaving ||
    props.artworkRevokePending ||
    props.revokePending ||
    (!props.remoteAllowed && !props.artworkAllowed);
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        screenStyles.content,
        props.reserveMiniBar && { paddingBottom: MINI_WINDOW_SPACE },
      ]}
    >
      <Heading title="设置" />
      <SettingSection label="节目来源">
        <SettingRow
          title="管理节目来源"
          value={
            props.sourceCount === undefined
              ? undefined
              : `${props.sourceCount} 份`
          }
          trailing={<Chevron />}
          onPress={props.onManageSources}
        />
      </SettingSection>
      <SettingSection label="联网与隐私">
        <SettingRow
          title="节目来源联网"
          status={
            props.revokePending
              ? { label: "撤销未保存", tone: "warn" }
              : props.remoteAllowed
                ? { label: "已允许", tone: "accent" }
                : { label: "未允许", tone: "muted" }
          }
          caption={
            props.revokePending
              ? "撤销尚未保存，保存前许可仍可能有效"
              : undefined
          }
          warn
          trailing={
            <Switch
              accessibilityLabel="节目来源联网"
              accessibilityHint="开启时需阅读并同意联网说明；关闭时撤销联网许可"
              value={props.remoteAllowed}
              disabled={props.revokePending}
              trackColor={{ true: colors.accent }}
              onValueChange={(value) =>
                value ? props.onAllowRemote() : props.onRevoke()
              }
            />
          }
        />
        {props.revokePending && (
          <SettingRow
            title="联网关闭尚未保存"
            trailing={
              <Button compact label="重试保存撤销" onPress={props.onRevoke} />
            }
          />
        )}
        <SettingRow
          title="频道台标"
          // 只说明该开关目前不能使用的原因。
          caption={props.remoteAllowed ? undefined : "需先允许节目来源联网"}
          dimmed={artworkDisabled}
          trailing={
            <Switch
              accessibilityLabel="显示频道台标"
              value={props.artworkAllowed}
              disabled={artworkDisabled}
              trackColor={{ true: colors.accent }}
              onValueChange={props.onArtworkChange}
            />
          }
        />
        {props.artworkRevokePending && (
          <SettingRow
            title="台标关闭尚未保存"
            status={{ label: "待重试", tone: "warn" }}
            trailing={
              <Button
                compact
                label="重试保存"
                accessibilityLabel="重试保存台标关闭"
                onPress={props.onRetryArtworkRevoke}
              />
            }
          />
        )}
        <SettingRow
          title="移动网络提醒"
          trailing={
            <Switch
              accessibilityLabel="移动网络提醒"
              value={props.mobileWarning}
              trackColor={{ true: colors.accent }}
              onValueChange={props.onMobileWarningChange}
            />
          }
        />
      </SettingSection>
      <SettingSection label="播放">
        <SettingRow
          title="后台播放"
          trailing={
            <Switch
              accessibilityLabel="后台播放"
              value={props.backgroundPlayback ?? true}
              disabled={props.backgroundSaving}
              trackColor={{ true: colors.accent }}
              onValueChange={props.onBackgroundPlaybackChange}
            />
          }
        />
        <SettingRow
          title="浮窗播放"
          trailing={
            <Switch
              accessibilityLabel="浮窗播放"
              value={props.miniPlayer}
              trackColor={{ true: colors.accent }}
              onValueChange={props.onMiniPlayerChange}
            />
          }
        />
      </SettingSection>
      {/* 本地资料与应用信息共用一张普通行组成的卡片；备份只占一行，页面末尾不再堆放一组大按钮。 */}
      <SettingSection label="资料与应用">
        {props.repo && props.onRestoreBackup && (
          <BackupControls repo={props.repo} onRestore={props.onRestoreBackup} />
        )}
        <About />
        <SettingRow
          title="清除所有数据"
          danger
          onPress={props.onClearAll}
        />
      </SettingSection>
    </ScrollView>
  );
}

const screenStyles = {
  content: { gap: 20 },
} as const;
