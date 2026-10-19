import React from "react";
import { ConsentDialog } from "./ConsentDialog";
import { RISK } from "./confirm";

/** 联网知情许可分为两层：先用三条短说明涵盖服务器可见 IP、HTTP 可被查看或篡改，以及许可可撤销；完整说明再点一下即可展开，内容从未删减，只是折叠。使用移动数据时增加第四条，使同一次确认同时涵盖流量提醒，首次播放只问一次。 */
export function NetworkConsentDialog({
  visible,
  cellular,
  onAnswer,
}: {
  visible: boolean;
  /** 设备可能正在使用移动数据，并且用户要求提醒。 */
  cellular: boolean;
  onAnswer: (allowed: boolean) => void;
}) {
  return (
    <ConsentDialog
      visible={visible}
      request={{
        title: "允许联网读取节目来源？",
        points: [
          "来源服务器会看到你的 IP",
          "HTTP 内容可能被窃听或篡改",
          ...(cellular ? ["当前可能在用移动数据，会消耗流量"] : []),
          "随时可在设置里撤销",
        ],
        details: RISK,
        actions: [
          { label: "不用了", value: "deny" },
          { label: "允许", value: "allow" },
        ],
        dismissValue: "deny",
      }}
      onAnswer={(value) => onAnswer(value === "allow")}
    />
  );
}
