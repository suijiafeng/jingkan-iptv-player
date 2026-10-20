import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as DocumentPicker from "expo-document-picker";
import type { Repository } from "../../data/repository";
import type { Source, SourceKind } from "../../domain/types";
import { MAX_MIB, parseM3U } from "../../domain/m3u";
import {
  downloadPlaylist,
  ImportIOError,
  readPickedFile,
} from "../../data/importIO";
import { confirm } from "../common/confirm";
import { initialForm, type SourceFormState } from "../source/form";
import { needsLanguageLookup } from "../source/iptvOrgLanguages";

/**
 * 添加或刷新节目单的表单：选择文件或下载，预览解析结果，
 * 再通过一次事务保存。只有最新任务可以更新表单。
 */
export function useSourceImport({
  repo,
  setError,
  mounted,
  remoteRef,
  guardRemote,
  checkNetwork,
  reconcilePlayingSources,
  changed,
  onImported,
  onReturnToManagement,
  onFillLanguages,
}: {
  repo: Repository | null;
  setError: (message: string) => void;
  mounted: MutableRefObject<boolean>;
  remoteRef: MutableRefObject<boolean>;
  guardRemote: () => Promise<boolean>;
  checkNetwork: () => Promise<boolean>;
  reconcilePlayingSources: () => Promise<void>;
  changed: () => void;
  /** 导入或刷新保存成功后，重新显示完整频道列表。 */
  onImported: () => void;
  /** 从来源管理打开的表单被取消后，应返回来源管理。 */
  onReturnToManagement: () => void;
  /** 保存后的列表若在预览中请求补全，则继续补全其语言。 */
  onFillLanguages: (sourceId: string) => void;
}) {
  const [form, setForm] = useState<SourceFormState | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const controller = useRef<AbortController | null>(null),
    generation = useRef(0),
    saving = useRef(false),
    fromManagement = useRef(false);

  useEffect(() => () => controller.current?.abort(), []);

  const cancelTask = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }, []);
  const taskRunning = useCallback(() => controller.current !== null, []);

  const startForm = (kind: SourceKind, openedFromManagement = false) => {
    fromManagement.current = openedFromManagement;
    setError("");
    setForm(initialForm(kind));
    setFormError("");
  };
  const updateForm = (patch: Partial<SourceFormState>) =>
    setForm((current) =>
      current ? { ...current, ...patch, preview: null } : current,
    );
  /** 预览中的语言开关；与 updateForm 不同，它不会清除预览。 */
  const setFillLanguages = (fillLanguages: boolean) =>
    setForm((current) => (current ? { ...current, fillLanguages } : current));

  const closeForm = async () => {
    if (saving.current) return;
    if (
      form &&
      (form.name || form.url || form.content || busy) &&
      !(await confirm(
        "放弃这次导入？",
        "尚未保存的输入与预览会被丢弃，已有频道不受影响。",
        "放弃",
      ))
    )
      return;
    cancelTask();
    if (form?.refresh) repo?.cancelRefresh(form.refresh.sourceId);
    setForm(null);
    setFormError("");
    if (fromManagement.current) {
      fromManagement.current = false;
      onReturnToManagement();
    }
  };

  const chooseFile = async () => {
    if (busy) return;
    const task = ++generation.current;
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
      if (result.canceled || task !== generation.current) return;
      const asset = result.assets[0];
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      const content = await readPickedFile(asset.uri, abort.signal);
      if (task === generation.current) {
        updateForm({ content, fileName: asset.name, kind: "file" });
        setFormError("");
      }
    } catch {
      if (task === generation.current)
        setFormError(`文件无法打开或超过 ${MAX_MIB} MB`);
    } finally {
      if (task === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };

  const preview = async () => {
    if (!form || busy) return;
    const snapshot = form;
    const task = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setFormError("");
    try {
      let text = snapshot.content,
        baseUrl: string | undefined;
      if (snapshot.kind === "url") {
        if (!(await guardRemote()) || task !== generation.current) return;
        if (!(await checkNetwork()) || task !== generation.current) return;
        const downloaded = await downloadPlaylist(
          snapshot.url.trim(),
          abort.signal,
          remoteRef.current,
        );
        text = downloaded.text;
        baseUrl = downloaded.url;
      } else if (!text) throw new ImportIOError("请先选择文件");
      const parsed = await parseM3U(text, { baseUrl, signal: abort.signal });
      if (task !== generation.current || abort.signal.aborted) return;
      setForm((current) =>
        current ? { ...current, preview: parsed } : current,
      );
    } catch (failure) {
      if (task === generation.current) {
        setFormError(
          failure instanceof Error
            ? failure.message
            : "节目单解析未完成，请检查内容后重试",
        );
        if (snapshot.refresh && !abort.signal.aborted)
          void repo
            ?.setSourceError(
              snapshot.refresh.sourceId,
              "refresh_failed",
              snapshot.refresh.revision,
            )
            .then(changed)
            .catch(() => {});
      }
    } finally {
      if (task === generation.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  };

  const save = async () => {
    if (!repo || !form?.preview || saving.current) return;
    saving.current = true;
    setBusy(true);
    const submitted = form;
    try {
      let sourceId: string;
      if (submitted.refresh) {
        sourceId = submitted.refresh.sourceId;
        await repo.refreshSource(
          submitted.refresh.sourceId,
          submitted.refresh.revision,
          submitted.preview!,
          {
            generation: submitted.refresh.generation,
            content: submitted.kind === "file" ? submitted.content : undefined,
            location:
              submitted.kind === "file" ? submitted.fileName : undefined,
          },
        );
        try {
          await reconcilePlayingSources();
        } catch {
          if (mounted.current) setError("已保存，请重新打开频道");
        }
      } else {
        const name =
          submitted.name.trim() ||
          (submitted.kind === "file"
            ? submitted.fileName
            : new URL(submitted.url).hostname);
        ({ id: sourceId } = await repo.importSource({
          name,
          kind: submitted.kind,
          location:
            submitted.kind === "file"
              ? submitted.fileName
              : submitted.url.trim(),
          preview: submitted.preview!,
          content: submitted.kind === "file" ? submitted.content : undefined,
        }));
      }
      setForm(null);
      fromManagement.current = false;
      onImported();
      changed();
      if (
        submitted.fillLanguages &&
        submitted.preview!.channels.some(needsLanguageLookup)
      )
        onFillLanguages(sourceId);
    } catch {
      setFormError("保存失败，原数据未变");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  /** 打开已预填内容的刷新表单，并持有来源令牌。 */
  const refresh = async (source: Source, openedFromManagement = false) => {
    if (!repo || busy) return;
    fromManagement.current = openedFromManagement;
    setError("");
    try {
      const token = await repo.beginRefresh(source.id);
      const content =
        source.kind === "file"
          ? (await repo.getSourceContent(source.id)) || ""
          : "";
      setForm({
        ...initialForm(source.kind),
        name: source.name,
        url: source.kind === "url" ? source.location : "",
        fileName: source.kind === "file" ? source.location : "",
        content,
        refresh: token,
      });
      setFormError("");
    } catch {
      setError("该来源正在刷新或已删除，请稍后重试");
      if (openedFromManagement) {
        fromManagement.current = false;
        onReturnToManagement();
      }
    }
  };

  /** 返回一层：预览返回编辑；编辑返回上层，未保存时先确认。 */
  const backForm = async () => {
    if (form?.preview) {
      // 正在保存预览列表时，在保存完成之前没有可返回的上一步。
      if (!busy) updateForm({});
      return;
    }
    await closeForm();
  };

  return {
    form,
    busy,
    formError,
    startForm,
    updateForm,
    setFillLanguages,
    closeForm,
    backForm,
    chooseFile,
    preview,
    save,
    refresh,
    cancelTask,
    taskRunning,
  };
}

export type SourceImport = ReturnType<typeof useSourceImport>;
