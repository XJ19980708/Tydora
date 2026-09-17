/**
 * uiScale（界面缩放/分辨率自适应）单元测试。
 *
 * 验证自动缩放换算、设置值归一化与解析逻辑
 * （node --experimental-strip-types 直接运行本文件；不触达 window/Tauri API）。
 */
import {
  normalizeUiScale,
  computeAutoUiScale,
  resolveUiScale,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
} from "./uiScale.ts";

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

console.log("── normalizeUiScale：设置值归一化 ──");
assertEqual(normalizeUiScale("auto"), "auto", '"auto" 保持 auto');
assertEqual(normalizeUiScale(undefined), "auto", "undefined → auto");
assertEqual(normalizeUiScale(null), "auto", "null → auto");
assertEqual(normalizeUiScale(1), 1, "1 → 1");
assertEqual(normalizeUiScale(0.85), 0.85, "0.85 → 0.85");
assertEqual(normalizeUiScale(75), 0.75, "百分数 75 → 0.75（旧数据兼容）");
assertEqual(normalizeUiScale(150), 1.5, "百分数 150 → 1.5");
assertEqual(normalizeUiScale(300), UI_SCALE_MAX, "超上限 → 1.5");
assertEqual(normalizeUiScale(0.3), UI_SCALE_MIN, "低于下限 → 0.75");
assertEqual(normalizeUiScale("abc"), "auto", "非法字符串 → auto");
assertEqual(normalizeUiScale(Number.NaN), "auto", "NaN → auto");
assertEqual(normalizeUiScale("1.25"), 1.25, "数字字符串 → 1.25");

console.log("\n── computeAutoUiScale：不同屏幕宽度的自动缩放 ──");
assertEqual(computeAutoUiScale(0), 1, "无屏幕信息 → 1");
assertEqual(computeAutoUiScale(1366), 0.75, "1366×768 → 0.75（下限）");
assertEqual(computeAutoUiScale(1536), 0.8, "1080p@125% → 0.8");
assertEqual(computeAutoUiScale(1600), 0.833, "1600 → 0.833");
assertEqual(computeAutoUiScale(1920), 1, "1920 → 1（基准）");
assertEqual(computeAutoUiScale(2048), 1.067, "2K@125% → 1.067");
assertEqual(computeAutoUiScale(2560), 1.25, "2K@100% → 1.25（上限）");
assertEqual(computeAutoUiScale(3840), 1.25, "4K@100% → 1.25（上限）");
assertEqual(computeAutoUiScale(1280), 0.75, "1280 → 0.75（下限）");

console.log("\n── resolveUiScale：自动/手动解析 ──");
assertEqual(resolveUiScale({}), 1, "无设置（Node 无 screen）→ 1");
assertEqual(resolveUiScale({ uiScale: "auto" }), 1, "auto（Node 无 screen）→ 1");
assertEqual(resolveUiScale({ uiScale: 1.1 }), 1.1, "手动 1.1 → 1.1");
assertEqual(resolveUiScale({ uiScale: 0.75 }), 0.75, "手动 0.75 → 0.75");

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
