import type { Repository } from "../data/repository";
import {
  LANGUAGE_SETTING,
  setLanguagePreference,
  type LanguagePreference,
} from "./core";

/** 保存成功后才发布语言变更，失败不改变当前界面。 */
export async function saveLanguagePreference(
  store: Pick<Repository, "setSetting">,
  value: LanguagePreference,
): Promise<void> {
  await store.setSetting(LANGUAGE_SETTING, value);
  setLanguagePreference(value);
}
