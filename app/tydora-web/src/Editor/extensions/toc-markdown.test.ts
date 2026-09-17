/**
 * TOC markdown 解析规则单元测试。
 *
 * 回归目标：`[TOC]` 在「重新解析」（重开文件 / 外部修改刷新 / 粘贴）时必须还原成
 * toc 节点，而不是退化成普通文本段落 —— 历史上因为 parse 规则优先级低于 paragraph
 * 且 getAttrs 返回 null 无法让出规则，导致 `[TOC]` 显示为普通文本。
 *
 * 运行：node --experimental-strip-types <本文件>
 */
import markdownit from "markdown-it";
import { isTocLine, installTocBlockRule } from "./toc-markdown.ts";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}\n      期望: ${String(expected)}\n      实际: ${String(actual)}`);
  }
}

function createMd() {
  const md = markdownit({ html: true, linkify: false, breaks: true });
  installTocBlockRule(md);
  return md;
}

console.log("── isTocLine：独立 [TOC] 判定 ──");
assertEqual(isTocLine("[TOC]"), true, "[TOC]");
assertEqual(isTocLine("[toc]"), true, "[toc] 大小写不敏感");
assertEqual(isTocLine("  [TOC]  "), true, "两侧空白");
assertEqual(isTocLine("含 [TOC] 的段落"), false, "混在正文里不算");
assertEqual(isTocLine("[TOC] 后面有字"), false, "行内额外文本不算");
assertEqual(isTocLine(""), false, "空文本");
assertEqual(isTocLine(null), false, "null");
assertEqual(isTocLine(undefined), false, "undefined");

console.log("\n── markdown → HTML ──");
const cases: Array<[string, string]> = [
  ["[TOC]", '<div data-toc="true"></div>'],
  ["[toc]", '<div data-toc="true"></div>'],
  ["# 标题\n\n[TOC]\n\n正文", '<h1>标题</h1>\n<div data-toc="true"></div>\n<p>正文</p>'],
  [
    "正文\n\n[TOC]\n\n更多正文\n\n[TOC]",
    '<p>正文</p>\n<div data-toc="true"></div>\n<p>更多正文</p>\n<div data-toc="true"></div>',
  ],
  ["含 [TOC] 的段落", "<p>含 [TOC] 的段落</p>"],
  // 列表项内的 [TOC] 不转换，避免破坏列表结构
  [
    "- 列表项\n- [TOC]",
    "<ul>\n<li>列表项</li>\n<li>[TOC]</li>\n</ul>",
  ],
];
const md = createMd();
for (const [input, expected] of cases) {
  const html = md.render(input).replace(/\n$/, "");
  assertEqual(html, expected, `渲染: ${JSON.stringify(input)}`);
}

console.log("\n── 规则幂等安装（parse() 每次解析都会重跑 setup）──");
{
  const md2 = markdownit({ html: true, breaks: true });
  const countRules = () =>
    (md2.core.ruler as any).__rules__.filter((r: any) => r.name === "tydora_toc_block").length;
  installTocBlockRule(md2);
  const after1 = countRules();
  installTocBlockRule(md2);
  installTocBlockRule(md2);
  const after3 = countRules();
  assertEqual(after1, 1, "首次安装注册 1 条规则");
  assertEqual(after3, 1, "重复调用不重复注册");
  // 反复解析后结果依旧稳定（规则未累加导致重复转换）
  const html = md2.render("[TOC]").replace(/\n$/, "");
  assertEqual(html, '<div data-toc="true"></div>', "重复安装后渲染仍正确");
  const html2 = md2.render("[TOC]").replace(/\n$/, "");
  assertEqual(html2, '<div data-toc="true"></div>', "多次解析结果一致");
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
