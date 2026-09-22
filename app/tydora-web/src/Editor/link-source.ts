/**
 * IR 模式点击链接转源码编辑的辅助函数。
 *
 * ⚠️ ProseMirror 的 doc.nodesBetween 不支持提前终止：回调返回 false
 * 只阻止向该节点的子节点递归，遍历仍会继续访问后续兄弟节点。
 * 因此「找到第一个就 return false」的写法是无效的 —— 后续命中的
 * 节点会不断覆盖结果，导致文档中有多个链接时永远命中扫描范围内
 * 的最后一个链接。
 *
 * 正确做法：用 found 标志防止覆盖，并要求命中的文本节点必须包含
 * 点击位置 pos（链接文本从 pos 开始或跨越 pos）。
 */

export interface LinkRange {
  from: number;
  to: number;
  href: string;
}

/**
 * 在 pos 处（及向后小范围扫描）查找包含 pos 的带 link mark 的文本节点。
 * 返回该链接的文档区间与 href；未命中返回 null。
 */
export function findLinkRangeAt(
  doc: import("prosemirror-model").Node,
  pos: number,
  scanAhead = 1000,
): LinkRange | null {
  const maxTo = Math.min(pos + scanAhead, doc.content.size);
  let result: LinkRange | null = null;

  doc.nodesBetween(pos, maxTo, (node, nodePos) => {
    if (result) return false; // 已命中，跳过剩余节点（注意：不会终止遍历，仅防覆盖）
    if (
      node.isText &&
      nodePos <= pos &&
      nodePos + node.nodeSize > pos
    ) {
      const linkMark = node.marks.find(
        (m: Record<string, any>) => m.type.name === "link",
      );
      if (linkMark) {
        result = {
          from: nodePos,
          to: nodePos + node.nodeSize,
          href: linkMark.attrs.href as string,
        };
      }
      return false;
    }
    return true;
  });

  return result;
}
