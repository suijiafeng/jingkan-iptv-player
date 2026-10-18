// 列表内容足够高、能够到达保存位置后，恢复滚动偏移。
//
// 列表刚重新加载时，虚拟列表只测量了少数行，并且
// JS 收到新布局时，原生内容甚至可能还没挂载，因此
// Android 会把过早调用的 scrollTo 限制到较短内容的范围内（较深的偏移位于
// 一万行的列表停在顶部，且未触发滚动事件；因此该请求
// 恢复请求持续保持待完成状态，每帧重新发送，直到列表报告到达目标
// 到达偏移、用户开始拖动、启动新加载，或经过约一秒时停止。
//
// request 和 retry 返回当前应滚动到的偏移；完成后返回 null。
export const MAX_RESTORE_ATTEMPTS = 60;

export type ScrollRestore = {
  request(offset: number): number;
  retry(): number | null;
  // 恢复尚未完成且 y 不等于目标时为 false：当前偏移
  // 列表太短而被截断的偏移不能覆盖已保存的位置。
  scrolled(y: number): boolean;
  cancel(): void;
  pending(): boolean;
};

export function createScrollRestore(): ScrollRestore {
  let target: number | null = null,
    attempts = 0;
  const retry = () => {
    if (target !== null && ++attempts > MAX_RESTORE_ATTEMPTS) target = null;
    return target;
  };
  return {
    request(offset) {
      attempts = 0;
      target = offset > 0 ? offset : null;
      return offset > 0 ? offset : 0;
    },
    retry,
    scrolled(y) {
      if (target === null) return true;
      if (Math.abs(y - target) > 1) return false;
      target = null;
      return true;
    },
    cancel() {
      target = null;
    },
    pending: () => target !== null,
  };
}
