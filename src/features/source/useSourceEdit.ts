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

/** 编辑页进行联网和回传结果所需的应用接口。 */
export interface SourceEditDeps {
  mounted: MutableRefObject<boolean>;
  remoteRef: MutableRefObject<boolean>;
  guardRemote: () => Promise<boolean>;
  checkNetwork: () => Promise<boolean>;
  reconcilePlayingSources: () => Promise<void>;
}

/**
 * 通过一次保存修改来源名称和链接；本地列表则修改其文件。
 * 新链接或新文件先读取，再通过一次事务替换旧频道；失败时保持原数据不变。
 * 未改变的字段不作处理，所以只改名称时绝不联网。
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
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  // 离开页面会停止仍在运行的下载或文件读取。
  useEffect(() => () => controller.current?.abort(), []);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    close();
  };

  const chooseFile = async () => {
    if (busy) return;
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
      if (result.canceled) return;
      const asset = result.assets[0];
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      const content = await readPickedFile(asset.uri, abort.signal);
      if (!abort.signal.aborted) {
        setFile({ name: asset.name, content });
        setError("");
      }
    } catch {
      setError(`文件无法打开或超过 ${MAX_MIB} MB`);
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;
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
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      if (relink || file) {
        let text = file?.content ?? "",
          baseUrl: string | undefined;
        // 在下载前取得，确保较新的更新会胜过本次更新。
        const token = await repo.beginRefresh(source.id);
        if (relink) {
          if (!(await deps.guardRemote()) || abort.signal.aborted) return;
          if (!(await deps.checkNetwork()) || abort.signal.aborted) return;
          const downloaded = await downloadPlaylist(
            newUrl,
            abort.signal,
            deps.remoteRef.current,
          );
          text = downloaded.text;
          baseUrl = downloaded.url;
        }
        const parsed = await parseM3U(text, { baseUrl, signal: abort.signal });
        if (abort.signal.aborted) return;
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
      if (newName !== source.name) {
        try {
          await repo.renameSource(source.id, newName);
        } catch {
          if (relink || file) changed();
          if (deps.mounted.current) setError("名称未保存，请重试");
          return;
        }
      }
      changed();
      if (!abort.signal.aborted) close();
    } catch (failure) {
      if (abort.signal.aborted || !deps.mounted.current) return;
      setError(
        failure instanceof ImportIOError || failure instanceof M3UParseError
          ? failure.message
          : relink || file
            ? "节目单未能更新，原频道不变"
            : "保存未完成，请重试",
      );
    } finally {
      if (controller.current === abort) controller.current = null;
      if (deps.mounted.current) setBusy(false);
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
    error,
    dismissError: () => setError(""),
    save: () => void save(),
    cancel,
  };
}

export type SourceEdit = ReturnType<typeof useSourceEdit>;
