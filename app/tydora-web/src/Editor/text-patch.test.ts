/**
 * computeTextPatch 单元测试。
 *
 * 验证最小差异补丁在各种变更形态（追加、删除、中间修改、整体重写等）下
 * 的正确性：对 oldText 应用补丁后必须精确还原 newText
 * （node --experimental-strip-types 直接运行本文件）。
 */
import { computeTextPatch, computeSpliceDiff } from "./text-patch.ts";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

function assertPatchWorks(oldStr: string, newStr: string, label: string): void {
  const patch = computeTextPatch(oldStr, newStr);
  if (patch === null) {
    assertEqual(oldStr, newStr, `${label}（应返回 null）`);
    return;
  }
  const applied = oldStr.slice(0, patch.from) + patch.insert + oldStr.slice(patch.to);
  assertEqual(applied, newStr, label);
}

console.log("── computeTextPatch：补丁正确性 ──");

// 末尾追加（agent 流式写入最常见形态）
assertPatchWorks("# 标题\n\n第一段", "# 标题\n\n第一段\n\n新追加的段落", "末尾追加段落");

// 开头插入
assertPatchWorks("正文内容", "# 新标题\n\n正文内容", "开头插入标题");

// 中间替换
assertPatchWorks("AAABBBCCC", "AAAXXXCCC", "中间替换");

// 纯删除
assertPatchWorks("AAABBBCCC", "AAACCC", "中间删除");
assertPatchWorks("AAA\n\nBBB", "AAA", "删除末尾块");

// 无变化
assertEqual(computeTextPatch("same", "same"), null, "内容一致返回 null");

// 空字符串边界
assertPatchWorks("", "新内容", "空 → 非空");
assertPatchWorks("旧内容", "", "非空 → 空");
assertPatchWorks("", "", "空 → 空");

// 特殊字符（代理对、换行）
assertPatchWorks("中文😀内容", "中文😀更新后内容", "含 emoji 的中文文本");
assertPatchWorks("a\nb\nc", "a\nbb\nc", "行内修改");

console.log("── computeSpliceDiff：块级序列差异 ──");

function assertSpliceEqual(
  actual: { start: number; deleteCount: number; insertCount: number } | null,
  expected: { start: number; deleteCount: number; insertCount: number } | null,
  label: string,
): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

const eq = (a: string, b: string) => a === b;
const applySplice = (oldItems: string[], d: { start: number; deleteCount: number; insertCount: number } | null, newItems: string[]) => {
  if (!d) return oldItems;
  return [...oldItems.slice(0, d.start), ...newItems.slice(d.start, d.start + d.insertCount), ...oldItems.slice(d.start + d.deleteCount)];
};

// 中间插入块（agent 在标题后追加段落）
{
  const oldB = ["h:标题", "p:第三行"];
  const newB = ["h:标题", "p:不是标题", "p:第三行"];
  const d = computeSpliceDiff(oldB, newB, eq);
  assertSpliceEqual(d, { start: 1, deleteCount: 0, insertCount: 1 }, "标题后插入段落");
  assertEqual(JSON.stringify(applySplice(oldB, d, newB)), JSON.stringify(newB), "标题后插入段落: 应用结果");
}

// 中间替换块
{
  const oldB = ["a", "b", "c"];
  const newB = ["a", "x", "y", "c"];
  const d = computeSpliceDiff(oldB, newB, eq);
  assertSpliceEqual(d, { start: 1, deleteCount: 1, insertCount: 2 }, "中间替换");
  assertEqual(JSON.stringify(applySplice(oldB, d, newB)), JSON.stringify(newB), "中间替换: 应用结果");
}

// 末尾追加
{
  const oldB = ["a", "b"];
  const newB = ["a", "b", "c", "d"];
  assertSpliceEqual(computeSpliceDiff(oldB, newB, eq), { start: 2, deleteCount: 0, insertCount: 2 }, "末尾追加");
}

// 开头插入
{
  const oldB = ["b", "c"];
  const newB = ["x", "b", "c"];
  assertSpliceEqual(computeSpliceDiff(oldB, newB, eq), { start: 0, deleteCount: 0, insertCount: 1 }, "开头插入");
}

// 等价（磁盘换行风格与序列化不同 → 解析出的块相同）
assertSpliceEqual(computeSpliceDiff(["h", "p"], ["h", "p"], eq), null, "完全等价返回 null");

// 整篇重写
{
  const oldB = ["a", "b", "c"];
  const newB = ["x", "y", "z"];
  assertSpliceEqual(computeSpliceDiff(oldB, newB, eq), { start: 0, deleteCount: 3, insertCount: 3 }, "整篇重写");
}

// 全部删除
{
  const oldB = ["a", "b"];
  const newB: string[] = [];
  const d = computeSpliceDiff(oldB, newB, eq);
  assertSpliceEqual(d, { start: 0, deleteCount: 2, insertCount: 0 }, "全部删除");
  assertEqual(JSON.stringify(applySplice(oldB, d, newB)), "[]", "全部删除: 应用结果");
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
