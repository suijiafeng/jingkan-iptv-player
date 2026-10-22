import type { ConsentRequest } from "./ConsentDialog";

/*
 * 除联网之外的单独知情许可。每个 `details` 都保留完整说明，
 * 绝不缩短；`points` 只用于引入完整内容。
 */

export const ARTWORK_CONSENT: ConsentRequest<"deny" | "allow"> = {
  title: "显示频道台标？",
  points: [
    "台标图片服务器会看到你的 IP",
    "可能消耗移动数据",
    "随时可在设置里关闭",
  ],
  details:
    "将加载节目单提供的 HTTPS 台标，图片服务器会看到你的访问 IP，可能消耗移动数据。仅用于显示台标，不提供节目封面；缺图或失败时显示频道首字。图片服务器可能将请求重定向至其他地址，无法保证全程加密。可随时在设置中关闭。",
  actions: [
    { label: "不用了", value: "deny" },
    { label: "允许显示", value: "allow" },
  ],
  dismissValue: "deny",
};

export const BACKGROUND_CONSENT: ConsentRequest<"deny" | "allow"> = {
  title: "允许后台播放？",
  points: [
    "切走或锁屏后继续联网播放",
    "持续耗电并使用流量",
    "随时可在设置里关闭",
  ],
  details:
    "切换应用或锁屏后仍会继续联网播放，并显示系统媒体控制；这会持续耗电和使用流量。",
  actions: [
    { label: "不用了", value: "deny" },
    { label: "允许后台播放", value: "allow" },
  ],
  dismissValue: "deny",
};
