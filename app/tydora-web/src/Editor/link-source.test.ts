/**
 * findLinkRangeAt 回归测试：IR 模式点击链接转源码编辑的区间定位。
 *
 * 回归背景：旧实现依赖 nodesBetween 回调 return false 提前终止遍历，
 * 但 ProseMirror 的 nodesBetween 不支持提前终止（false 仅阻止向子节点
 * 递归），导致文档中有多个链接时 from/to/href 被后续链接覆盖 ——
 * 无论点击哪个链接，转源码编辑的永远是扫描范围内的最后一个链接。
 *
 * 运行方式：node --experimental-strip-types link-source.test.ts
 * （需在仓库根目录运行以解析 node_modules）
 */
// @ts-expect-error jsdom 无 @types 声明，测试专用依赖
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import { findLinkRangeAt } from "./link-source.ts";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Text = dom.window.Text;
globalThis.getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 0);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
dom.window.Element.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON() {} };
};

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

function createEditor(content: string, element: HTMLElement): Editor {
  return new Editor({
    element,
    extensions: [StarterKit.configure({ link: false }), TiptapLink.configure({ openOnClick: false })],
    content,
  });
}

console.log("── findLinkRangeAt：多链接点击定位 ──");

// 场景 1：三个独立段落各一个链接（最常见：一行一个链接）
{
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = createEditor(
    '<p><a href="https://a.com">Google</a></p><p><a href="https://b.com">Baidu</a></p><p><a href="https://c.com">Github</a></p>',
    el,
  );
  const { doc } = editor.state;

  // 点击第一个链接（pos = 段落开头 + 1）
  const r1 = findLinkRangeAt(doc, 1);
  assertEqual(r1?.href, "https://a.com", "点击第 1 个链接命中第 1 个");
  assertEqual(doc.textBetween(r1!.from, r1!.to), "Google", "第 1 个链接文本正确");

  // 点击第二个链接
  const r2 = findLinkRangeAt(doc, 9);
  assertEqual(r2?.href, "https://b.com", "点击第 2 个链接命中第 2 个");
  assertEqual(doc.textBetween(r2!.from, r2!.to), "Baidu", "第 2 个链接文本正确");

  // 点击第三个链接
  const r3 = findLinkRangeAt(doc, 17);
  assertEqual(r3?.href, "https://c.com", "点击第 3 个链接命中第 3 个");

  editor.destroy();
}

// 场景 2：同一段落内多个链接 + 普通文本混排
{
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = createEditor(
    '<p>看 <a href="https://a.com">这里</a> 和 <a href="https://b.com">那里</a>。</p>',
    el,
  );
  const { doc } = editor.state;

  // 定位 "看 " (pos1-2) 这里(3-5) 和(6-7) 那里(8-10)
  const r1 = findLinkRangeAt(doc, 3);
  assertEqual(r1?.href, "https://a.com", "同段落点击第 1 个链接命中第 1 个");
  const r2 = findLinkRangeAt(doc, 8);
  assertEqual(r2?.href, "https://b.com", "同段落点击第 2 个链接命中第 2 个");

  // 点击在普通文本上：不应命中任何链接
  const r0 = findLinkRangeAt(doc, 1);
  assertEqual(r0, null, "点击普通文本不命中链接");

  editor.destroy();
}

// 场景 3：无链接文档
{
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = createEditor("<p>纯文本</p>", el);
  const r = findLinkRangeAt(editor.state.doc, 1);
  assertEqual(r, null, "无链接文档返回 null");
  editor.destroy();
}

// 场景 4：链接后还有后续内容时，命中不越界
{
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = createEditor(
    '<p><a href="https://a.com">链接A</a></p><p>后续段落</p>',
    el,
  );
  const r = findLinkRangeAt(editor.state.doc, 1);
  assertEqual(r?.href, "https://a.com", "链接后仍有内容时命中正确");
  assertEqual(doc2Text(editor.state.doc, r!), "链接A", "区间文本恰好是链接本身");
  editor.destroy();
}

function doc2Text(doc: any, r: { from: number; to: number }): string {
  return doc.textBetween(r.from, r.to);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
