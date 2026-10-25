import React, { useEffect, useState } from "react";
import { Modal, Platform, type ModalProps } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConsentHost, openLayer } from "./ConsentDialog";

/**
 * 整页弹层。iOS 为每个 Modal 创建独立窗口，应用的 SafeAreaProvider 无法
 * 覆盖到它，内部 SafeAreaView 会拿到零边距，因此每个弹层需要自己的 provider。
 * iOS 页面使用 sheet，下滑关闭会触发 onRequestClose，与 Android 返回键走同一路径。
 * 当此页面为最新弹层时，在其中呈现许可问题。
 */
export function ScreenModal({
  sheet = true,
  children,
  ...props
}: ModalProps & { sheet?: boolean }) {
  const [layer] = useState(() => ({}));
  const { visible = true } = props;
  useEffect(() => (visible ? openLayer(layer) : undefined), [visible, layer]);
  return (
    <Modal
      presentationStyle={
        sheet && Platform.OS === "ios" ? "pageSheet" : "fullScreen"
      }
      {...props}
    >
      <SafeAreaProvider>
        {children}
        <ConsentHost layer={layer} />
      </SafeAreaProvider>
    </Modal>
  );
}
