import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Keyboard,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Channel, Source } from "./domain/types";
import {
  effectiveCountry,
  useRegionPreference,
} from "./features/region/useRegionPreference";
import { ErrorNotice } from "./components/ui";
import { ToastHost } from "./components/Toast";
import { NetworkConsentDialog } from "./features/common/NetworkConsentDialog";
import { styles as theme } from "./theme";
import { useAutoAvailabilityCheck } from "./features/channel/useAutoAvailabilityCheck";
import { useChannelFilters } from "./features/channel/useChannelFilters";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import {
  type HeaderProps,
  type ListTab,
  type Tab,
} from "./features/channel/ChannelListParts";
import { BottomTabs } from "./features/channel/BottomTabs";
import { useAppSettings } from "./features/home/useAppSettings";
import { useChannelListData } from "./features/home/useChannelListData";
import { usePlayback } from "./features/home/usePlayback";
import { useSourceImport } from "./features/home/useSourceImport";
import { useSourceTasks } from "./features/home/useSourceTasks";
import { useChannelActions } from "./features/home/useChannelActions";
import { useDataControls } from "./features/home/useDataControls";
import { ChannelListPage } from "./features/home/ChannelListPage";
import { HomePlayer } from "./features/home/HomePlayer";
import { SourceDialogs } from "./features/home/SourceDialogs";
import { StartupScreen } from "./features/home/StartupScreen";
import { FirstRunGuide } from "./features/guide/FirstRunGuide";

/**
 * 主页面：底部标签切换频道列表或设置，承载来源对话框和播放器
 * （全屏，或停靠在标签栏上方的小条）。状态及其规则放在
 * features/home 下的各个 hook 中。
 */
export default function App() {
  const [error, setError] = useState(""),
    [tab, setTab] = useState<Tab>("all"),
    [manage, setManage] = useState(false),
    [rename, setRename] = useState<Source | null>(null),
    // 停靠播放器下方标签栏的高度。
    [tabsHeight, setTabsHeight] = useState(0);
  const settings = useAppSettings({ setError, setTab });
  const { repo, mounted } = settings;
  // 频道页和播放器选台面板共享同一份筛选状态。
  const filters = useChannelFilters();
  const { sourceId, group, language, search, query } = filters;
  const region = useRegionPreference(repo, setError);
  const countryKey = JSON.stringify([
    region.preference.mode,
    region.preference.countryCode,
    region.result.countryCode,
  ]);
  // “定位当前频道”暂时显示所有国家/地区，直到偏好发生变化。
  const countryBypassed = filters.countryBypass === countryKey;
  const list = useChannelListData({
    repo,
    tab,
    sourceId,
    group,
    language,
    query,
    region,
    countryKey,
    countryBypassed,
  });
  const { changed, channels, sources } = list;
  const country = countryBypassed
    ? null
    : effectiveCountry(region.preference, region.result, list.facets.countries);
  const playback = usePlayback({
    repo,
    setError,
    mounted,
    permissionEpoch: settings.permissionEpoch,
    guardRemote: settings.guardRemote,
    channels,
    listSettled: list.listSettled,
    fullList: list.fullList,
  });
  const { playing, playerMini } = playback;
  const actions = useChannelActions({
    repo,
    setError,
    mounted,
    list,
    playback,
  });
  const { recentBusy, recentEditing, setRecentEditing } = actions;
  const importer = useSourceImport({
    repo,
    setError,
    mounted,
    remoteRef: settings.remoteRef,
    guardRemote: settings.guardRemote,
    checkNetwork: settings.checkNetwork,
    reconcilePlayingSources: playback.reconcilePlayingSources,
    changed,
    onImported: () => {
      setTab("all");
      setRecentEditing(false);
      filters.reset();
    },
    onReturnToManagement: () => setManage(true),
  });
  const sourceTasks = useSourceTasks({
    repo,
    setError,
    mounted,
    remoteRef: settings.remoteRef,
    permissionEpoch: settings.permissionEpoch,
    guardRemote: settings.guardRemote,
    checkNetwork: settings.checkNetwork,
    changed,
  });
  // 分类切换后，在后台检测当前显示的频道。
  const { progress: autoCheck, cancel: cancelAutoCheck } =
    useAutoAvailabilityCheck({
      filterKey:
        tab === "all" &&
        (country !== null || language !== null || group !== null || !!sourceId)
          ? JSON.stringify([sourceId, country, language, group, query])
          : null,
      listComplete: !list.listLoading && list.channelTotal === null,
      channels,
      paused: !!playing || !!sourceTasks.check,
      remoteAllowed: settings.remoteAllowed && !settings.revokePending,
      mobileWarning: settings.mobileWarning,
      mobileAccepted: settings.mobileAccepted,
      repo,
      onFinished: changed,
      onError: setError,
    });
  const controls = useDataControls({
    repo,
    setError,
    settings,
    list,
    playback,
    importer,
    sourceTasks,
    cancelAutoCheck,
    region,
    filters,
    setTab,
    setRecentEditing,
  });

  // 离开应用会停止所有网络任务；播放器自行暂停。
  const { cancelTask, taskRunning } = importer;
  const { stopCheck, stopLanguageLookup } = sourceTasks;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      if (taskRunning()) cancelTask();
      stopCheck();
      stopLanguageLookup();
      cancelAutoCheck();
    });
    return () => subscription.remove();
  }, [cancelTask, taskRunning, stopCheck, stopLanguageLookup, cancelAutoCheck]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // 展开的播放器接管返回键，停靠小条则交给
        // 先处理当前页面自己的对话框，只有其它层都关闭后才停止播放
        // 处于打开状态。
        if (playing && !playerMini) return false;
        if (rename) {
          setRename(null);
          return true;
        }
        if (importer.form) {
          void importer.closeForm();
          return true;
        }
        if (manage) {
          setManage(false);
          return true;
        }
        if (recentEditing) {
          setRecentEditing(false);
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  });

  // 行组件已记忆化；传入稳定的处理函数，再由它调用最新闭包。
  const rowActions = useRef({
    play: (_channel: Channel) => {},
    favorite: (_channel: Channel) => {},
    removeRecent: (_channel: Channel) => {},
  });
  useEffect(() => {
    rowActions.current = {
      play: (channel) => void playback.play(channel),
      favorite: (channel) => void actions.favorite(channel),
      removeRecent: (channel) => {
        setError("");
        void actions
          .removeRecent(channel)
          .catch(() => setError("删除观看记录失败，请重试"));
      },
    };
  });
  const onRowPlay = useCallback(
    (channel: Channel) => rowActions.current.play(channel),
    [],
  );
  const onRowFavorite = useCallback(
    (channel: Channel) => rowActions.current.favorite(channel),
    [],
  );
  const onRowRemoveRecent = useCallback(
    (channel: Channel) => rowActions.current.removeRecent(channel),
    [],
  );

  const changeTab = (key: Tab) => {
    setRecentEditing(false);
    filters.switchTab(
      tab === "settings" ? null : tab,
      key === "settings" ? null : key,
    );
    list.restoreOnNextLoad(key);
    setTab(key);
  };

  if (!repo)
    return (
      <StartupScreen
        error={error}
        onRetry={() => {
          setError("");
          settings.retryStartup();
        }}
      />
    );

  const listTab: ListTab = tab === "settings" ? "all" : tab;
  const enabledSources = sources.filter((source) => source.enabled);
  /** 筛选条件变化后，当前标签从顶部重新开始。 */
  const restartList = () => list.scrollToTopOnNextLoad(tab);
  const listHeaderProps: HeaderProps = {
    tab: listTab,
    sources: enabledSources,
    search,
    sourceId,
    facets: list.facets,
    facetSelection: { country, language, content: group },
    countryHint:
      region.preference.mode === "manual"
        ? "手动选择"
        : region.result.countryCode && country === null
          ? "当前来源暂无识别地区的国家/地区标注，显示全部"
          : region.result.message,
    autoCheck,
    recentBusy,
    recentEditing,
    recentCount: list.recent.length,
    onToggleRecentEditing: () => {
      if (recentBusy) return;
      if (!recentEditing) {
        list.scrollToTopOnNextLoad("recent");
        filters.clearSearch();
      }
      setRecentEditing(!recentEditing);
    },
    onClearRecent: () => {
      setError("");
      void actions
        .clearRecent()
        .catch(() => setError("清空观看记录失败，请重试"));
    },
    onSearchChange: (text) => {
      restartList();
      filters.setSearch(text);
    },
    onClearSearch: () => {
      restartList();
      filters.clearSearch();
    },
    onSourceChange: (id) => {
      restartList();
      filters.setSource(id);
    },
    onFacetChange: (selection, kind) => {
      restartList();
      Keyboard.dismiss();
      filters.setFacets(selection);
      if (kind === "country") {
        filters.setCountryBypass(null);
        void region.selectManualCountry(selection.country);
      }
    },
  };
  const rows = !list.hasCurrentList || list.listError ? [] : channels;
  const playerExpanded = !!playing && !playerMini;
  return (
    <SafeAreaView
      style={theme.screen}
      edges={["top", "bottom", "left", "right"]}
    >
      {/* 展开的播放器覆盖这部分内容，期间需对 TalkBack 隐藏。播放器停靠后，页面仍可使用。 */}
      <View
        style={appStyles.fill}
        importantForAccessibility={
          playerExpanded ? "no-hide-descendants" : "auto"
        }
        accessibilityElementsHidden={playerExpanded}
      >
        {!!error && !manage && !rename && !importer.form && (
          <View style={appStyles.errorBanner}>
            <ErrorNotice message={error} onDismiss={() => setError("")} />
          </View>
        )}
        {tab === "settings" ? (
          <SettingsScreen
            repo={repo}
            onRestoreBackup={controls.restoreBackup}
            sourceCount={sources.length}
            remoteAllowed={settings.remoteAllowed}
            revokePending={settings.revokePending}
            artworkAllowed={settings.artworkAllowed}
            artworkSaving={settings.artworkSaving}
            artworkRevokePending={settings.artworkRevokePending}
            onRetryArtworkRevoke={() => void settings.changeArtwork(false)}
            onArtworkChange={(value) => void settings.changeArtwork(value)}
            regionConsented={
              region.preference.ipAllowed ||
              region.preference.locationAllowed ||
              region.revokePending
            }
            regionBusy={region.busy}
            onRevokeRegion={() => void region.revokeConsent()}
            mobileWarning={settings.mobileWarning}
            onManageSources={() => {
              setError("");
              setManage(true);
            }}
            onRevoke={() => void controls.revoke()}
            onAllowRemote={() => void settings.guardRemote()}
            onMobileWarningChange={(value) =>
              settings.saveToggle("mobileWarning", value)
            }
            swipeReverse={settings.swipeReverse}
            onSwipeReverseChange={(value) =>
              settings.saveToggle("swipeReverse", value)
            }
            skipUnreachable={settings.skipUnreachable}
            backgroundPlayback={settings.backgroundPlayback}
            backgroundSaving={settings.backgroundSaving}
            onBackgroundPlaybackChange={(value) =>
              void settings.changeBackgroundPlayback(value)
            }
            onSkipUnreachableChange={(value) =>
              settings.saveToggle("skipUnreachable", value)
            }
            onClearAll={() => void controls.clearAll()}
            onShowGuide={settings.showGuide}
          />
        ) : (
          <ChannelListPage
            listRef={list.listRef}
            scrollY={list.scrollY}
            onListScroll={list.onListScroll}
            onScrollBeginDrag={list.scrollRestore.cancel}
            onScrollSettled={list.saveTabOffset}
            listLoading={list.listLoading}
            listError={list.listError}
            headerProps={listHeaderProps}
            rows={rows}
            emptyActions={{
              hasSources: sources.length > 0,
              filtered:
                !!query ||
                !!sourceId ||
                group !== null ||
                language !== null ||
                country !== null,
              onRetry: changed,
              onAddUrl: () => importer.startForm("url"),
              onAddFile: () => importer.startForm("file"),
              onShowAll: () => {
                setRecentEditing(false);
                setTab("all");
                filters.reset();
                void region.selectManualCountry(null);
              },
              onManageSources: () => {
                setError("");
                setManage(true);
              },
            }}
            artworkEnabled={settings.artworkEnabled}
            onPlay={onRowPlay}
            onFavorite={onRowFavorite}
            onRemoveRecent={
              tab === "recent" && recentEditing ? onRowRemoveRecent : undefined
            }
            recentBusy={recentBusy}
            reserveMiniBar={!!playing && playerMini}
          />
        )}
        <View
          onLayout={(event) => setTabsHeight(event.nativeEvent.layout.height)}
        >
          <BottomTabs tab={tab} onChange={changeTab} />
        </View>
      </View>
      <SourceDialogs
        repo={repo}
        sources={sources}
        managing={manage}
        setManaging={setManage}
        renaming={rename}
        setRenaming={setRename}
        error={error}
        setError={setError}
        importer={importer}
        sourceTasks={sourceTasks}
        onRemoveSource={(source) => void controls.removeSource(source)}
        onSetSourceEnabled={controls.setSourceEnabled}
        changed={changed}
      />
      <NetworkConsentDialog
        visible={settings.consentCellular !== null}
        cellular={!!settings.consentCellular}
        onAnswer={settings.answerConsent}
      />
      <FirstRunGuide
        visible={settings.guideVisible}
        onFinish={(exit) => {
          settings.finishGuide();
          if (exit) importer.startForm(exit);
        }}
      />
      {playing && (
        <HomePlayer
          playing={playing}
          playback={playback}
          settings={settings}
          tabsHeight={tabsHeight}
          freshRows={[...playback.playQueue, ...channels, ...list.recent]}
          error={error}
          onDismissError={() => setError("")}
          onFavorite={(channel) => void actions.favorite(channel)}
          onStarted={actions.recordStarted}
          onAvailability={(channel, ok) =>
            void actions.recordAvailability(channel, ok)
          }
          sheet={{
            filters: listHeaderProps,
            onTabChange: changeTab,
            channels: rows,
            rangeKey: list.hasCurrentList
              ? JSON.stringify([
                  tab,
                  sourceId,
                  group,
                  language,
                  countryKey,
                  countryBypassed,
                  query,
                ])
              : null,
            loading: list.listLoading,
            onLocate: () => {
              list.scrollToTopOnNextLoad("all");
              setRecentEditing(false);
              if (tab !== "all") changeTab("all");
              filters.reset();
              filters.setCountryBypass(countryKey);
            },
          }}
        />
      )}
      <ToastHost />
    </SafeAreaView>
  );
}

const appStyles = StyleSheet.create({
  fill: { flex: 1 },
  errorBanner: { padding: 12 },
});
