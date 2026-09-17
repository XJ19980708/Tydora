/**
 * detectSystemLanguage / collectNavigatorLocales 单元测试。
 *
 * 验证"操作系统语言 → 文档/界面语言"的自动检测在各种系统语言环境下
 * 的映射是否正确（node --experimental-strip-types 直接运行本文件）。
 */
import { detectSystemLanguage, collectNavigatorLocales } from "./detect.ts";

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

console.log("── detectSystemLanguage：不同系统语言环境 ──");

// 中文系统（简体）
assertEqual(detectSystemLanguage(["zh-CN"]), "zh-CN", "系统语言 zh-CN → zh-CN");
// 中文系统（繁体，Windows 台湾/香港）→ 归一到简体中文资源
assertEqual(detectSystemLanguage(["zh-TW"]), "zh-CN", "系统语言 zh-TW → zh-CN");
assertEqual(detectSystemLanguage(["zh-HK"]), "zh-CN", "系统语言 zh-HK → zh-CN");
// 英文系统
assertEqual(detectSystemLanguage(["en-US"]), "en-US", "系统语言 en-US → en-US");
assertEqual(detectSystemLanguage(["en-GB"]), "en-US", "系统语言 en-GB → en-US");
// 其他语言系统 → 回退英文
assertEqual(detectSystemLanguage(["fr-FR"]), "en-US", "系统语言 fr-FR → en-US（回退）");
assertEqual(detectSystemLanguage(["ja-JP"]), "en-US", "系统语言 ja-JP → en-US（回退）");
assertEqual(detectSystemLanguage(["de-DE"]), "en-US", "系统语言 de-DE → en-US（回退）");
assertEqual(detectSystemLanguage(["ko-KR"]), "en-US", "系统语言 ko-KR → en-US（回退）");
assertEqual(detectSystemLanguage(["ru-RU"]), "en-US", "系统语言 ru-RU → en-US（回退）");
// 空值 / 异常输入
assertEqual(detectSystemLanguage([]), "en-US", "空列表 → en-US（回退）");
assertEqual(detectSystemLanguage([undefined]), "en-US", "undefined → en-US（回退）");
assertEqual(detectSystemLanguage([""]), "en-US", "空字符串 → en-US（回退）");
// 多候选：按优先级遍历（首选项非中英文时继续看后面的候选）
assertEqual(detectSystemLanguage(["fr-FR", "en-US"]), "en-US", "fr-FR + en-US 候选 → en-US");
assertEqual(detectSystemLanguage(["fr-FR", "zh-CN"]), "zh-CN", "fr-FR + zh-CN 候选 → zh-CN");
assertEqual(detectSystemLanguage(["de-DE", "ja-JP"]), "en-US", "de/ja 候选 → en-US（回退）");
// 大小写不敏感（部分环境返回大写或带下划线）
assertEqual(detectSystemLanguage(["ZH-cn"]), "zh-CN", "大小写混排 ZH-cn → zh-CN");

console.log("── collectNavigatorLocales：候选收集与去重 ──");

const fakeNav = {
  language: "zh-CN",
  languages: ["zh-CN", "en", "zh"],
} as unknown as Navigator;
assertEqual(
  JSON.stringify(collectNavigatorLocales(fakeNav)),
  JSON.stringify(["zh-CN", "en", "zh"]),
  "language 优先 + languages 去重",
);

const emptyNav = { language: "", languages: [] } as unknown as Navigator;
assertEqual(JSON.stringify(collectNavigatorLocales(emptyNav)), "[]", "空 navigator → 空数组");

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) {
  process.exit(1);
}
