import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as DocumentPicker from "expo-document-picker";
import type { Repository } from "../../data/repository";
import {
  downloadPlaylist,
  ImportIOError,
  readPickedFile,
} from "../../data/importIO";
import { M3UParseError, MAX_MIB, parseM3U } from "../../domain/m3u";
import type { Source } from "../../domain/types";
import { confirm } from "../common/confirm";

/** 编辑页进行联网和回传结果所需的应用接口。 */
export interface SourceEditDeps {
  mounted: MutableRefObject<boolean>;
  remoteRef: MutableRefObject<boolean>;
  guardRemote: () => Promise<boolean>;
  checkNetwork: () => Promise<boolean>;
  reconcilePlayingSources: () => Promise<void>;
}

/**
 * 一次保存中编辑来源名称、链接（本地列表则为文件）。
 * 新链接或文件会先读取，再通过一个事务替换旧频道；失败时不改变任何数据。
 * 未改动的字段与已有语言配置保持原样，因此只保存新名称不会联网。
 */
export function useSourceEdit({
  repo,
  source,
  close,
  changed,
  deps,
}: {
  repo: Repository;
  /** 页面按来源分别挂载并设置 key，因此初始值就是该来源当前值。 */
  source: Source;
  close: () => void;
  changed: () => void;
  deps: SourceEditDeps;
}) {
  const [name, setName] = useState(source.name),
    [url, setUrl] = useState(source.kind === "url" ? source.location : ""),
    [file, setFile] = useState<{ name: string; content: string } | null>(null),
    [busy, setBusy] = useState(false),
    [committing, setCommitting] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null),
    alive = useRef(true),
    generation = useRef(0),
    commitPending = useRef(false),
    confirmPending = useRef(false),
    refreshing = useRef(false);

  // 离开页面会停止仍在运行的下载或文件读取。
  useEffect(() => {
    alive.current = true;
    generation.current++;
    return () => {
      alive.current = false;
      controller.current?.abort();
      if (refreshing.current && !commitPending.current)
        repo.cancelRefresh(source.id);
    };
  }, [repo, source.id]);

  const dirty =
    name !== source.name ||
    (source.kind === "url" && url !== source.location) ||
    file !== null;

  const cancel = async () => {
    // SQLite 提交不能被 AbortSignal 取消；让页面保持
    // 持续显示，直到所有写入完成，而不是假装它们已经停止。
    if (commitPending.current || confirmPending.current) return;
    // 提问之前先停止读取，防止它在对话框后面完成并提交
    // 用户仍在决定是否放弃时的确认框；保持输入
    // 让用户在选择留下时可以重新启动该读取。
    if (controller.current) {
      generation.current++;
      controller.current.abort();
      controller.current = null;
      if (refreshing.current) repo.cancelRefresh(source.id);
      refreshing.current = false;
      setBusy(false);
      if (dirty) setError("读取已停止，修改仍保留；可重新保存");
    }
    if (dirty) {
      confirmPending.current = true;
      try {
        if (
          !(await confirm(
            "放弃这次修改？",
            "尚未保存的输入会被丢弃，正在读取的任务会停止。",
            "放弃修改",
          ))
        )
          return;
      } finally {
        confirmPending.current = false;
      }
    }
    if (!alive.current || commitPending.current) return;
    generation.current++;
    controller.current = null;
    if (refreshing.current) repo.cancelRefresh(source.id);
    refreshing.current = false;
    setBusy(false);
    close();
  };

  const chooseFile = async () => {
    if (controller.current || confirmPending.current) return;
    const task = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    const current = () =>
      alive.current && task === generation.current && !abort.signal.aborted;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "audio/x-mpegurl",
          "application/vnd.apple.mpegurl",
          "text/plain",
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !current()) return;
      const asset = result.assets[0];
      const content = await readPickedFile(asset.uri, abort.signal);
      if (current()) {
        setFile({ name: asset.name, content });
        setError("");
      }
    } catch {
      if (current()) setError(`文件无法打开或超过 ${MAX_MIB} MB`);
    } finally {
      if (controller.current === abort) controller.current = null;
      if (current()) setBusy(false);
    }
  };

  const save = async () => {
    if (controller.current || confirmPending.current) return;
    const newName = name.trim();
    if (!newName) {
      setError("请填写名称");
      return;
    }
    const newUrl = url.trim();
    const relink = source.kind === "url" && newUrl !== source.location;
    if (relink && !newUrl) {
      setError("请填写链接");
      return;
    }
    const abort = new AbortController();
    const task = ++generation.current;
    const current = () =>
      alive.current && task === generation.current && !abort.signal.aborted;
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      if (relink || file) {
        let text = file?.content ?? "",
          baseUrl: string | undefined;
        // 在下载前取得，确保较新的更新会胜过本次更新。
        const token = await repo.beginRefresh(source.id);
        if (!current()) return;
        refreshing.current = true;
        if (relink) {
          if (!(await deps.guardRemote()) || !current()) return;
          if (!(await deps.checkNetwork()) || !current()) return;
          const downloaded = await downloadPlaylist(
            newUrl,
            abort.signal,
            deps.remoteRef.current,
          );
          text = downloaded.text;
          baseUrl = downloaded.url;
        }
        const parsed = await parseM3U(text, { baseUrl, signal: abort.signal });
        if (!current()) return;
        commitPending.current = true;
        setCommitting(true);
        await repo.refreshSource(source.id, token.revision, parsed, {
          generation: token.generation,
          location: relink ? newUrl : file?.name,
          content: file?.content,
        });
        try {
          await deps.reconcilePlayingSources();
        } catch {
          /* 列表已经保存；播放器在重新打开时读取更新。 */
        }
      }
      if (!current()) return;
      commitPending.current = true;
      setCommitting(true);
      if (newName !== source.name) {
        try {
          await repo.renameSource(source.id, newName);
        } catch {
          if (relink || file) changed();
          if (current())
            setError(
              relink || file
                ? "节目单已更新，名称未保存，请重试"
                : "名称未保存，请重试",
            );
          return;
        }
      }
      changed();
      if (current()) close();
    } catch (failure) {
      if (!current() || !deps.mounted.current) return;
      setError(
        failure instanceof ImportIOError || failure instanceof M3UParseError
          ? failure.message
          : relink || file
            ? "节目单未能更新，原频道不变"
            : "保存未完成，请重试",
      );
    } finally {
      // 用户开始另一次保存后，已取消的读取仍可能才返回。
      // 只有仍持有这个控制器的任务，才能解除其写入锁。
      if (controller.current === abort) {
        controller.current = null;
        refreshing.current = false;
        commitPending.current = false;
      }
      if (alive.current && task === generation.current) {
        setBusy(false);
        setCommitting(false);
      }
    }
  };

  return {
    name,
    setName: (text: string) => {
      setName(text);
      setError("");
    },
    url,
    setUrl: (text: string) => {
      setUrl(text);
      setError("");
    },
    fileName: file?.name ?? (source.kind === "file" ? source.location : ""),
    chooseFile: () => void chooseFile(),
    busy,
    committing,
    error,
    dismissError: () => setError(""),
    save: () => void save(),
    cancel: () => void cancel(),
  };
}

export type SourceEdit = ReturnType<typeof useSourceEdit>;
