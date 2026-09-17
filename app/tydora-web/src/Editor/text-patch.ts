/**
 * 文本最小差异补丁（公共前缀/后缀法）。
 *
 * 用于「同文件外部内容更新」场景（如 AI agent 改写文件后编辑器刷新）：
 * 在旧文本的 [from, to) 区间替换为 insert 即可得到新文本。
 * 相比整篇替换，最小补丁能让编辑器只做局部更新，
 * 且选区映射后光标落在未变更区域时位置完全不变（防闪烁、保光标）。
 */
export interface TextPatch {
  /** 旧文本中被替换区间的起始偏移 */
  from: number;
  /** 旧文本中被替换区间的结束偏移（不含） */
  to: number;
  /** 替换进来的新文本 */
  insert: string;
}

export function computeTextPatch(oldStr: string, newStr: string): TextPatch | null {
  if (oldStr === newStr) return null;

  // 公共前缀：从头找到第一个不同的字符
  const maxPrefix = Math.min(oldStr.length, newStr.length);
  let start = 0;
  while (start < maxPrefix && oldStr.charCodeAt(start) === newStr.charCodeAt(start)) start++;

  // 公共后缀：从尾往前找，且不能与公共前缀重叠
  let suffix = 0;
  while (
    suffix < oldStr.length - start &&
    suffix < newStr.length - start &&
    oldStr.charCodeAt(oldStr.length - 1 - suffix) === newStr.charCodeAt(newStr.length - 1 - suffix)
  ) {
    suffix++;
  }

  return {
    from: start,
    to: oldStr.length - suffix,
    insert: newStr.slice(start, newStr.length - suffix),
  };
}

/** 序列差异结果：把 oldItems 的 [start, start + deleteCount) 替换为 newItems 的 [start, start + insertCount) */
export interface SpliceDiff {
  start: number;
  deleteCount: number;
  insertCount: number;
}

/**
 * 序列最小差异（公共前缀/后缀法），用于块级 diff 等场景。
 * 返回 null 表示两个序列完全等价（无实际变化）。
 */
export function computeSpliceDiff<T>(
  oldItems: readonly T[],
  newItems: readonly T[],
  equals: (a: T, b: T) => boolean,
): SpliceDiff | null {
  const minLen = Math.min(oldItems.length, newItems.length);
  let start = 0;
  while (start < minLen && equals(oldItems[start], newItems[start])) start++;
  let endOld = oldItems.length;
  let endNew = newItems.length;
  while (endOld > start && endNew > start && equals(oldItems[endOld - 1], newItems[endNew - 1])) {
    endOld--;
    endNew--;
  }
  if (start === endOld && start === endNew) return null;
  return { start, deleteCount: endOld - start, insertCount: endNew - start };
}
