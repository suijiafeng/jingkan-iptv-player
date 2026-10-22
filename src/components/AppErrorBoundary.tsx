import React, { Component, type ReactNode } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Heading, Notice } from "./ui";
import { styles } from "../theme";

/**
 * 渲染和生命周期故障的最后一道恢复边界。失败子树会卸载并释放会话；
 * 重试会创建全新子树。绝不保留、展示或转发错误对象，因为它可能含来源令牌。
 * 异步操作和事件处理函数仍应自行处理错误。
 */
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; generation: number }
> {
  state = { failed: false, generation: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // 刻意不接入应用日志或错误上报服务。
  }

  private retry = () => {
    this.setState(({ generation }) => ({
      failed: false,
      generation: generation + 1,
    }));
  };

  render() {
    if (this.state.failed)
      return (
        <SafeAreaView style={styles.screen}>
          <ScrollView
            contentContainerStyle={recoveryStyles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Heading title="静看 TV" />
            <Notice
              title="页面暂时无法显示"
              body="请重新打开页面。节目源与收藏保留在本机，重试不会清空资料。"
              error
            />
            <Button label="重新打开页面" onPress={this.retry} />
          </ScrollView>
        </SafeAreaView>
      );

    return (
      <React.Fragment key={this.state.generation}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

const recoveryStyles = StyleSheet.create({
  content: { ...styles.content, flexGrow: 1, justifyContent: "center" },
});
