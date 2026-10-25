import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../../theme";
import { HeadphonesIcon, PictureInPictureIcon } from "../player/playerIcons";

type SettingIconName =
  | "sources"
  | "network"
  | "artwork"
  | "mobile"
  | "background"
  | "floating"
  | "backup"
  | "about"
  | "clear";

/** 设置菜单的装饰图标：沿用原生 View 线条，不依赖图标字体。 */
export function SettingIcon({
  name,
  color = colors.muted,
}: {
  name: SettingIconName;
  color?: string;
}) {
  const line = { borderColor: color };
  const fill = { backgroundColor: color };
  let shape: React.ReactNode;
  switch (name) {
    case "sources":
      shape = (
        <>
          <View style={[iconStyles.document, line]} />
          {[6, 10, 14].map((top) => (
            <View key={top} style={[iconStyles.documentLine, fill, { top }]} />
          ))}
        </>
      );
      break;
    case "network":
      shape = (
        <>
          <View style={[iconStyles.globe, line]} />
          <View style={[iconStyles.meridian, line]} />
          <View style={[iconStyles.equator, fill]} />
        </>
      );
      break;
    case "artwork":
      shape = (
        <>
          <View style={[iconStyles.picture, line]} />
          <View style={[iconStyles.sun, fill]} />
          <View style={[iconStyles.mountain, line]} />
        </>
      );
      break;
    case "mobile":
      shape = [5, 9, 13, 17].map((height, index) => (
        <View
          key={height}
          style={[iconStyles.signal, fill, { height, left: index * 5 + 1 }]}
        />
      ));
      break;
    case "background":
      shape = <HeadphonesIcon size={20} color={color} />;
      break;
    case "floating":
      shape = <PictureInPictureIcon size={20} color={color} />;
      break;
    case "backup":
      shape = (
        <>
          <View style={[iconStyles.archive, line]} />
          <View style={[iconStyles.archiveLid, line]} />
          <View style={[iconStyles.archiveHandle, fill]} />
        </>
      );
      break;
    case "about":
      shape = (
        <>
          <View style={[iconStyles.globe, line]} />
          <View style={[iconStyles.infoDot, fill]} />
          <View style={[iconStyles.infoStem, fill]} />
        </>
      );
      break;
    case "clear":
      shape = (
        <>
          <View style={[iconStyles.bin, line]} />
          <View style={[iconStyles.binLid, fill]} />
          <View style={[iconStyles.binHandle, line]} />
          {[7, 11].map((left) => (
            <View key={left} style={[iconStyles.binLine, fill, { left }]} />
          ))}
        </>
      );
      break;
  }
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={iconStyles.box}
    >
      {shape}
    </View>
  );
}

const iconStyles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  document: {
    position: "absolute",
    top: 1,
    left: 3,
    width: 14,
    height: 18,
    borderWidth: 1.6,
    borderRadius: 2,
  },
  documentLine: { position: "absolute", left: 6, width: 8, height: 1.5 },
  globe: { width: 18, height: 18, borderWidth: 1.6, borderRadius: 9 },
  meridian: {
    position: "absolute",
    top: 1,
    left: 6,
    width: 8,
    height: 18,
    borderWidth: 1.4,
    borderRadius: 5,
  },
  equator: { position: "absolute", top: 9.3, left: 2, width: 16, height: 1.4 },
  picture: { width: 18, height: 16, borderWidth: 1.6, borderRadius: 2 },
  sun: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  mountain: {
    position: "absolute",
    top: 10,
    left: 8,
    width: 7,
    height: 7,
    borderTopWidth: 1.6,
    borderLeftWidth: 1.6,
    transform: [{ rotate: "45deg" }],
  },
  signal: { position: "absolute", bottom: 1, width: 3, borderRadius: 1 },
  archive: {
    position: "absolute",
    left: 3,
    top: 7,
    width: 14,
    height: 12,
    borderWidth: 1.6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  archiveLid: {
    position: "absolute",
    left: 1,
    top: 3,
    width: 18,
    height: 5,
    borderWidth: 1.6,
    borderRadius: 1,
  },
  archiveHandle: {
    position: "absolute",
    top: 11,
    left: 7,
    width: 6,
    height: 1.6,
  },
  infoDot: {
    position: "absolute",
    top: 5,
    left: 9,
    width: 2,
    height: 2,
    borderRadius: 1,
  },
  infoStem: { position: "absolute", top: 9, left: 9, width: 2, height: 6 },
  bin: {
    position: "absolute",
    left: 4,
    top: 6,
    width: 12,
    height: 13,
    borderWidth: 1.6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  binLid: { position: "absolute", left: 2, top: 4, width: 16, height: 1.6 },
  binHandle: {
    position: "absolute",
    left: 7,
    top: 1,
    width: 6,
    height: 4,
    borderTopWidth: 1.6,
    borderLeftWidth: 1.6,
    borderRightWidth: 1.6,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  binLine: { position: "absolute", top: 9, width: 1.4, height: 7 },
});
