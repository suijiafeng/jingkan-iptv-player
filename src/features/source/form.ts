import type {
  ImportPreview,
  RefreshToken,
  SourceKind,
} from "../../domain/types";

export type SourceFormState = {
  kind: SourceKind;
  name: string;
  url: string;
  fileName: string;
  content: string;
  preview: ImportPreview | null;
  refresh: RefreshToken | null;
  /** 保存后，从 iptv-org 补全缺失语言；该行为已在预览中说明。 */
  fillLanguages: boolean;
};

export const initialForm = (kind: SourceKind = "url"): SourceFormState => ({
  kind,
  name: "",
  url: "",
  fileName: "",
  content: "",
  preview: null,
  refresh: null,
  fillLanguages: true,
});
