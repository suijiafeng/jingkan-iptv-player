import { useCallback, useEffect, useRef, useState } from "react";
import type { Repository } from "../../data/repository";
import { isCountryCode } from "../../domain/channelFacets";
import { readDeviceEvidence } from "./native";
import {
  DEFAULT_COUNTRY_PREFERENCE,
  NO_REGION,
  parseCountryPreference,
  resolveRegion,
  type CountryPreference,
  type RegionResult,
} from "./policy";

export { effectiveCountry, regionBasis } from "./policy";
export type { CountryPreference, RegionResult } from "./policy";
export const COUNTRY_PREFERENCE_KEY = "countryPreference";

export function useRegionPreference(
  repo: Repository | null,
  onError: (message: string) => void,
) {
  const [preference, setPreference] = useState<CountryPreference>({
    ...DEFAULT_COUNTRY_PREFERENCE,
  });
  const [result, setResult] = useState<RegionResult>({ ...NO_REGION });
  const [ready, setReady] = useState(false);
  const preferenceRef = useRef(preference);
  const committedPreference = useRef<CountryPreference>({
    ...DEFAULT_COUNTRY_PREFERENCE,
  });
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const generation = useRef(0);
  const initialization = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const assignPreference = useCallback((next: CountryPreference) => {
    preferenceRef.current = next;
    setPreference(next);
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
  }, []);

  const save = useCallback(
    (next: CountryPreference, operation: number): Promise<boolean> => {
      const storageLifecycle = initialization.current;
      const write = writes.current.then(async () => {
        if (!repo || generation.current !== operation) return false;
        await repo.setSetting(COUNTRY_PREFERENCE_KEY, next);
        if (initialization.current === storageLifecycle)
          committedPreference.current = next;
        return generation.current === operation;
      });
      // 每个调用方处理自己的错误，后续写入仍必须继续。
      writes.current = write.catch(() => undefined);
      return write;
    },
    [repo],
  );

  useEffect(() => {
    const initializationId = ++initialization.current;
    generation.current += 1;
    void (async () => {
      // 等当前这次处理完成后，再启动异步仓库订阅。
      // 渲染提交之后才开始；其生命周期与取消排队中的写入彼此独立。
      await Promise.resolve();
      if (initialization.current !== initializationId) return;
      setReady(false);
      assignPreference({ ...DEFAULT_COUNTRY_PREFERENCE });
      committedPreference.current = { ...DEFAULT_COUNTRY_PREFERENCE };
      setResult({ ...NO_REGION });
      if (repo) {
        try {
          const stored: unknown = await repo.getSetting(
            COUNTRY_PREFERENCE_KEY,
            DEFAULT_COUNTRY_PREFERENCE,
          );
          if (initialization.current !== initializationId) return;
          const next = parseCountryPreference(stored);
          committedPreference.current = next;
          assignPreference(next);
          setResult(
            next.mode === "auto"
              ? resolveRegion(readDeviceEvidence())
              : { ...NO_REGION },
          );
          setReady(true);
        } catch {
          if (initialization.current !== initializationId) return;
          setReady(true);
          onErrorRef.current("地区偏好读取未完成，暂显示全部");
        }
      }
    })();
    return () => {
      initialization.current += 1;
      generation.current += 1;
    };
  }, [repo, assignPreference]);

  const selectManualCountry = useCallback(
    async (value: string | null) => {
      cancel();
      if (!ready || !repo) return;
      if (value !== null && value !== "" && !isCountryCode(value)) {
        onErrorRef.current("该地区不可选，请重新选择");
        return;
      }
      const operation = generation.current;
      const next: CountryPreference = {
        ...preferenceRef.current,
        mode: "manual",
        countryCode: value,
      };
      try {
        if (await save(next, operation)) {
          assignPreference(next);
          setResult({ ...NO_REGION });
        }
      } catch {
        if (generation.current === operation) {
          // 上一次写入可能在其 UI 回调失效后才提交。
          // 已被后续选择取代；最新选择保存失败时，应显示 SQLite 实际接受的值。
          const committed = committedPreference.current;
          assignPreference(committed);
          setResult(
            committed.mode === "auto"
              ? resolveRegion(readDeviceEvidence())
              : { ...NO_REGION },
          );
          onErrorRef.current("地区选择未保存，请重试");
        }
      }
    },
    [assignPreference, cancel, ready, repo, save],
  );

  const reset = useCallback(() => {
    cancel();
    initialization.current += 1;
    setReady(true);
    assignPreference({ ...DEFAULT_COUNTRY_PREFERENCE });
    committedPreference.current = { ...DEFAULT_COUNTRY_PREFERENCE };
    setResult(resolveRegion(readDeviceEvidence()));
  }, [assignPreference, cancel]);

  return {
    preference,
    result,
    ready,
    selectManualCountry,
    reset,
    cancel,
  };
}
