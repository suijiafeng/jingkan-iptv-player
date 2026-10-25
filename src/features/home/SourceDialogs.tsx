import React, { useEffect, useState } from "react";
import type { Repository } from "../../data/repository";
import type { Source } from "../../domain/types";
import { SourceFormModal } from "../source/SourceFormModal";
import { EditSourceModal } from "../source/EditSourceModal";
import type { SourceEditDeps } from "../source/useSourceEdit";
import { SourceManagerModal } from "../source/SourceManagerModal";
import type { SourceImport } from "./useSourceImport";
import type { useSourceTasks } from "./useSourceTasks";

/** 来源管理及其打开的对话页，包括将名称和链接一次保存的编辑页，以及添加表单。二者均叠在仍保持打开的管理页之上，退出时只需露出下面的管理页。Android 上若同一时刻关闭一个模态页并打开另一个，新页面可能尚未绘制却已拦截触摸。 */
export function SourceDialogs({
  repo,
  sources,
  managing,
  setManaging,
  renaming,
  setRenaming,
  error,
  setError,
  importer,
  sourceTasks,
  onRemoveSource,
  onSetSourceEnabled,
  changed,
  editDeps,
}: {
  repo: Repository;
  sources: Source[];
  managing: boolean;
  setManaging: (open: boolean) => void;
  renaming: Source | null;
  setRenaming: (source: Source | null) => void;
  error: string;
  setError: (message: string) => void;
  importer: SourceImport;
  sourceTasks: ReturnType<typeof useSourceTasks>;
  onRemoveSource: (source: Source) => void;
  onSetSourceEnabled: (source: Source, enabled: boolean) => Promise<void>;
  changed: () => void;
  /** 编辑页保存操作使用的联网许可和播放相关接口。 */
  editDeps: SourceEditDeps;
}) {
  const [sourceSaving, setSourceSaving] = useState<string | null>(null);

  // 编辑页从属于来源管理；管理页关闭时它也应关闭，
  // 例如从编辑页保存更新后，界面切换到了频道列表。
  useEffect(() => {
    if (!managing) setRenaming(null);
  }, [managing, setRenaming]);
  // iOS 只能从下方页面呈现新页面，因此从其中打开的页面
  // 管理页位于它的内部。
  const sourceForm = (
    <SourceFormModal
      form={importer.form}
      busy={importer.busy}
      error={importer.formError || error}
      onUpdate={importer.updateForm}
      onFillLanguages={importer.setFillLanguages}
      onChooseFile={() => void importer.chooseFile()}
      onPreview={() => void importer.preview()}
      onSave={() => void importer.save()}
      onBack={() => void importer.backForm()}
    />
  );
  return (
    <>
      <SourceManagerModal
        visible={managing}
        // 上层对话框已经自行显示共享错误。
        error={renaming || importer.form ? undefined : error}
        onDismissError={() => setError("")}
        sources={sources}
        check={sourceTasks.check}
        summaries={sourceTasks.checkSummaries}
        onClose={() => setManaging(false)}
        onAdd={(kind) => importer.startForm(kind, true)}
        onRename={(source) => {
          setError("");
          setRenaming(source);
        }}
        onRemove={onRemoveSource}
        sourceSaving={sourceSaving}
        onEnabledChange={(source, enabled) => {
          if (sourceSaving) return;
          setSourceSaving(source.id);
          void onSetSourceEnabled(source, enabled).finally(() =>
            setSourceSaving(null),
          );
        }}
        onCheck={(source, force) => void sourceTasks.runCheck(source, force)}
        onStopCheck={sourceTasks.stopCheck}
      >
        <EditSourceModal
          source={renaming}
          repo={repo}
          close={() => setRenaming(null)}
          changed={changed}
          deps={editDeps}
        />
        {managing && sourceForm}
      </SourceManagerModal>
      {!managing && sourceForm}
    </>
  );
}
