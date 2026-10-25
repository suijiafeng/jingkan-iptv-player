import React, { useState, useSyncExternalStore } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../components/ui";
import { colors, sizes, styles, type } from "../../theme";

export interface ConsentAction<Value extends string = string> {
  label: string;
  value: Value;
  secondary?: boolean;
}

export interface ConsentRequest<Value extends string = string> {
  title: string;
  /** 两到四行简短文字，覆盖关键事项。 */
  points: readonly string[];
  /** 完整的知情许可说明；可以折叠，但绝不删减。 */
  details: string;
  /** 从左到右排列，最后一项为主要操作。 */
  actions: readonly ConsentAction<Value>[];
  /** 按返回、系统关闭或其它关闭方式时使用的回答值。 */
  dismissValue: Value;
}

/** 知情许可分为两层：先显示几个简短要点，再点一下即可查看完整说明。内容从未遗漏，只是折叠；每次打开时，完整说明默认收起。 */
export function ConsentDialog({
  visible,
  request,
  onAnswer,
}: {
  visible: boolean;
  request: ConsentRequest;
  onAnswer: (value: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const answer = (value: string) => {
    setDetailsOpen(false);
    onAnswer(value);
  };
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={() => answer(request.dismissValue)}
    >
      <View style={dialogStyles.scrim}>
        <View
          accessibilityViewIsModal
          accessibilityLabel={request.title}
          style={dialogStyles.panel}
        >
          <Text accessibilityRole="header" style={dialogStyles.title}>
            {request.title}
          </Text>
          <ScrollView contentContainerStyle={dialogStyles.body}>
            {request.points.map((point) => (
              <View key={point} style={dialogStyles.point}>
                <View style={dialogStyles.bullet} />
                <Text style={[styles.body, dialogStyles.pointText]}>
                  {point}
                </Text>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen((open) => !open)}
              style={dialogStyles.detailsToggle}
            >
              <Text style={dialogStyles.detailsToggleText}>
                {detailsOpen ? "收起说明" : "完整说明 ›"}
              </Text>
            </Pressable>
            {detailsOpen && (
              <Text style={[styles.muted, dialogStyles.details]}>
                {request.details}
              </Text>
            )}
          </ScrollView>
          <View style={dialogStyles.actions}>
            {request.actions.map((action, index) => (
              <Button
                key={action.value}
                compact
                secondary={
                  action.secondary ?? index < request.actions.length - 1
                }
                label={action.label}
                onPress={() => answer(action.value)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface Pending {
  request: ConsentRequest;
  resolve: (value: string) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => pending;

/**
 * 已打开的页面弹层，最新的放在末尾。iOS 从根视图控制器呈现每个 Modal，
 * 页面已经打开时无法再从根控制器呈现第二个，因此问题显示在最新页面中，
 * 而不是应用根节点。
 */
let layers: readonly object[] = [];
const getLayers = () => layers;

/** 标记一个页面弹层已打开，并返回用于标记其关闭的函数。 */
export function openLayer(layer: object) {
  layers = [...layers, layer];
  emit();
  return () => {
    layers = layers.filter((open) => open !== layer);
    emit();
  };
}

/**
 * 通过应用的 ConsentHost 提出一个分层许可问题。
 * 新问题会替换尚未回答的旧问题，旧问题按关闭处理。
 */
export function askConsent<Value extends string>(
  request: ConsentRequest<Value>,
): Promise<Value> {
  return new Promise<Value>((resolve) => {
    const previous = pending;
    pending = {
      request,
      resolve: (value) => resolve(value as Value),
    };
    previous?.resolve(previous.request.dismissValue);
    emit();
  });
}

/** 回答当前显示的问题；没有问题时不执行操作。 */
export function answerConsent(value: string) {
  const answered = pending;
  if (!answered) return;
  pending = null;
  emit();
  answered.resolve(value);
}

/** 当前显示的问题；没有时为 null。 */
export const currentConsent = () => pending?.request ?? null;

/** 显示 askConsent 当前提出的问题：未打开页面模态层时使用根宿主，否则使用最新页面内的宿主。 */
export function ConsentHost({ layer }: { layer?: object }) {
  const shown = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const open = useSyncExternalStore(subscribe, getLayers, getLayers);
  if (!shown || (open.at(-1) ?? undefined) !== layer) return null;
  return (
    <ConsentDialog visible request={shown.request} onAnswer={answerConsent} />
  );
}

const dialogStyles = StyleSheet.create({
  scrim: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  panel: {
    maxHeight: "86%",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    backgroundColor: colors.raised,
  },
  title: { ...type.title, fontSize: 20, color: colors.text },
  body: { gap: 10 },
  point: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    marginTop: 7,
    borderRadius: 3,
    backgroundColor: colors.muted,
  },
  pointText: { flex: 1 },
  detailsToggle: { minHeight: sizes.touch, justifyContent: "center" },
  detailsToggleText: { ...type.body, color: colors.accent },
  details: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
});
