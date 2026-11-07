import { t } from "../../i18n/core";
import { Alert } from "react-native";

export const RISK =
  "本应用直接连接你选择的节目来源服务器，服务器会收到你的 IP 地址与访问请求。未加密（HTTP）内容可能被查看或篡改；即使主链接为 HTTPS，后续媒体请求或重定向也可能未加密。应用尚不能完全防止域名解析或重定向将请求引向其他地址或局域网设备。请仅使用你信任且有权使用的节目来源。此许可适用于联网导入、播放、地址检测，以及你选择的语言补全；语言补全会访问 iptv-org 公开数据库。频道台标会另行征求同意。可随时在设置中撤销联网许可，撤销后将停止播放和相关联网任务。";

export const confirm = (
  title: string,
  message: string,
  action = t("确认"),
): Promise<boolean> =>
  new Promise((resolve) =>
    Alert.alert(
      t(title),
      t(message),
      [
        { text: t("取消"), style: "cancel", onPress: () => resolve(false) },
        { text: t(action), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
