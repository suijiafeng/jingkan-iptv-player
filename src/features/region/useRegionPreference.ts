import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import type { Repository } from "../../data/repository";
import { isCountryCode } from "../../domain/channelFacets";
import { detectRegion, readDeviceEvidence } from "./native";
import {
  DEFAULT_COUNTRY_PREFERENCE,
  NO_REGION,
  parseCountryPreference,
  resolveRegion,
  type CountryPreference,
  type RegionResult,
} from "./policy";

export { effectiveCountry } from "./policy";
export type { CountryPreference, RegionResult } from "./policy";
export const COUNTRY_PREFERENCE_KEY = "countryPreference";

type ConsentChoice = "allow" | "skip" | "cancel";

function consent(title: string, message: string): Promise<ConsentChoice> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "取消", style: "cancel", onPress: () => resolve("cancel") },
        { text: "跳过", onPress: () => resolve("skip") },
        { text: "允许", onPress: () => resolve("allow") },
      ],
      { cancelable: true, onDismiss: () => resolve("cancel") },
    ),
  );
}

export function useRegionPreference(
  repo: Repository | null,
  onError: (message: string) => void,
) {
  const [preference, setPreference] = useState<CountryPreference>({
    ...DEFAULT_COUNTRY_PREFERENCE,
  });
  const [result, setResult] = useState<RegionResult>({ ...NO_REGION });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const revokePendingRef = useRef(false);
  const readyRef = useRef(false);
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
  const controller = useRef<AbortController | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());

  const assignPreference = useCallback((next: CountryPreference) => {
    preferenceRef.current = next;
    setPreference(next);
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
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

  const runDetection = useCallback(
    async (
      next: CountryPreference,
      operation: number,
      requestLocationPermission: boolean,
    ) => {
      const request = new AbortController();
      controller.current = request;
      setBusy(true);
      try {
        const detected = await detectRegion({
          ipAllowed: next.ipAllowed,
          locationAllowed: next.locationAllowed,
          requestLocationPermission,
          signal: request.signal,
        });
        if (generation.current !== operation || request.signal.aborted) return;
        const saved = { ...next, countryCode: detected.countryCode };
        if (!(await save(saved, operation))) return;
        assignPreference(saved);
        setResult(detected);
      } catch {
        if (generation.current === operation && !request.signal.aborted)
          onErrorRef.current(
            "国家/地区识别或保存未完成，当前选择保持不变，请稍后重试。",
          );
      } finally {
        if (generation.current === operation) setBusy(false);
        if (controller.current === request) controller.current = null;
      }
    },
    [assignPreference, save],
  );

  useEffect(() => {
    const initializationId = ++initialization.current;
    const operation = ++generation.current;
    controller.current?.abort();
    controller.current = null;
    readyRef.current = false;
    revokePendingRef.current = false;
    void (async () => {
      // 等当前这次处理完成后，再启动异步仓库订阅。
      // 渲染已经提交；其生命周期与取消识别任务相互独立。
      await Promise.resolve();
      if (initialization.current !== initializationId) return;
      setReady(false);
      setBusy(false);
      setRevokePending(false);
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
          readyRef.current = true;
          if (
            generation.current === operation &&
            next.mode === "auto" &&
            (next.ipAllowed || next.locationAllowed) &&
            AppState.currentState === "active"
          )
            await runDetection(next, operation, false);
        } catch {
          if (initialization.current !== initializationId) return;
          setReady(true);
          readyRef.current = true;
          onErrorRef.current("无法读取国家/地区偏好，请重试；当前显示全部。");
        }
      }
    })();
    return () => {
      initialization.current += 1;
      generation.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [repo, assignPreference, runDetection]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" && readyRef.current) cancel();
    });
    return () => subscription.remove();
  }, [cancel]);

  const selectManualCountry = useCallback(
    async (value: string | null) => {
      cancel();
      if (!ready || !repo) return;
      if (value !== null && value !== "" && !isCountryCode(value)) {
        onErrorRef.current("无效的国家/地区选择。");
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
          assignPreference(
            revokePendingRef.current
              ? { ...committed, ipAllowed: false, locationAllowed: false }
              : committed,
          );
          setResult(
            committed.mode === "auto"
              ? resolveRegion(readDeviceEvidence())
              : { ...NO_REGION },
          );
          onErrorRef.current(
            "国家/地区选择未能保存，当前选择保持不变，请重试。",
          );
        }
      }
    },
    [assignPreference, cancel, ready, repo, save],
  );

  const detectWithConsent = useCallback(async () => {
    if (!ready || !repo || AppState.currentState !== "active") return;
    if (revokePendingRef.current) {
      onErrorRef.current("请先重试保存国家/地区识别授权的撤销。");
      return;
    }
    cancel();
    const operation = generation.current;
    setBusy(true);
    const isCurrent = () =>
      generation.current === operation && AppState.currentState === "active";
    try {
      const previous = preferenceRef.current;
      const ipChoice = previous.ipAllowed
        ? "allow"
        : await consent(
            "使用访问 IP 辅助识别？",
            "应用将访问 ipapi.co 的 HTTPS 国家/地区查询接口。该服务商会看到本次访问 IP，并用它返回国家/地区；应用不保存 IP。此许可只用于国家/地区识别，与节目来源联网许可独立。可跳过并使用手机设置或可选定位。",
          );
      if (!isCurrent() || ipChoice === "cancel") return;
      const locationChoice = previous.locationAllowed
        ? "allow"
        : await consent(
            "使用手机位置辅助识别？",
            "仅在前台获取一次大致位置，并使用手机系统的反向地理编码服务查询国家/地区；系统服务可能联网处理位置。坐标不会发给 IP 查询服务，也不会保存。接下来可在系统提示中选择大致位置或拒绝。不启用后台定位，可跳过。",
          );
      if (!isCurrent() || locationChoice === "cancel") return;
      const next: CountryPreference = {
        mode: "auto",
        countryCode: null,
        ipAllowed: ipChoice === "allow",
        locationAllowed: locationChoice === "allow",
      };
      if (!(await save(next, operation)) || !isCurrent()) return;
      assignPreference(next);
      // 切回自动模式后，不能保留先前的手动结果。
      setResult(resolveRegion(readDeviceEvidence()));
      await runDetection(next, operation, locationChoice === "allow");
    } catch {
      if (isCurrent())
        onErrorRef.current("识别授权未能保存，未开始新的识别，请重试。");
    } finally {
      if (generation.current === operation) setBusy(false);
    }
  }, [assignPreference, cancel, ready, repo, runDetection, save]);

  const revokeConsent = useCallback(async () => {
    cancel();
    if (!ready || !repo) return;
    const operation = generation.current;
    const next = {
      ...preferenceRef.current,
      ipAllowed: false,
      locationAllowed: false,
    };
    // 立即停止信任旧许可，即使 SQLite 暂时
    // 不可用；在移除操作持久化之前保留重试状态。
    revokePendingRef.current = true;
    setRevokePending(true);
    assignPreference(next);
    setResult(
      next.mode === "auto"
        ? resolveRegion(readDeviceEvidence())
        : { ...NO_REGION },
    );
    try {
      if (await save(next, operation)) {
        revokePendingRef.current = false;
        setRevokePending(false);
      }
    } catch {
      if (generation.current === operation)
        onErrorRef.current("本次识别已停止，但撤销授权未能保存，请重试。");
    }
  }, [assignPreference, cancel, ready, repo, save]);

  const reset = useCallback(() => {
    cancel();
    initialization.current += 1;
    readyRef.current = true;
    setReady(true);
    revokePendingRef.current = false;
    setRevokePending(false);
    assignPreference({ ...DEFAULT_COUNTRY_PREFERENCE });
    committedPreference.current = { ...DEFAULT_COUNTRY_PREFERENCE };
    setResult(resolveRegion(readDeviceEvidence()));
  }, [assignPreference, cancel]);

  return {
    preference,
    result,
    busy,
    ready,
    revokePending,
    selectManualCountry,
    detectWithConsent,
    revokeConsent,
    reset,
    cancel,
  };
}
