import type { SupportedLanguage } from "./index";

/**
 * 系统语言自动检测。
 *
 * WebView2（Windows）中 `navigator.language` 默认跟随**操作系统显示语言**：
 * 系统语言为中文时返回 "zh-CN"，英文时返回 "en-US"，其他语言返回对应 BCP-47
 * 标签（如 "fr-FR"）。此模块只做"语言标签 → 受支持语言"的映射，保持纯函数，
 * 便于对不同系统语言环境做单元测试。
 */

/**
 * 从候选语言标签列表推导应用显示语言。
 *
 * @param preferredLocales 候选列表，按优先级排列（首个应为系统 UI 语言）。
 *        形如 ["zh-CN", "en"]、["en-US"]、["fr-FR"] 等。
 * @returns 受支持的语言代码：中文（zh-*，含 zh-TW/zh-HK）→ zh-CN；
 *          英文（en-*）→ en-US；其余/无法识别 → en-US（兜底）。
 */
export function detectSystemLanguage(
  preferredLocales: readonly (string | undefined | null)[],
): SupportedLanguage {
  for (const raw of preferredLocales) {
    if (!raw) continue;
    if (/^zh/i.test(raw)) return "zh-CN";
    if (/^en/i.test(raw)) return "en-US";
  }
  return "en-US";
}

/**
 * 收集运行环境的语言偏好，按优先级去重排列。
 * `navigator.language` 置于首位（系统主语言），其后是 `navigator.languages`。
 * 测试/SSR 等无 navigator 环境返回空数组。
 */
export function collectNavigatorLocales(nav?: Navigator): string[] {
  try {
    const n: Navigator | undefined =
      nav ?? (typeof navigator !== "undefined" ? navigator : undefined);
    if (!n) return [];
    const primary = n.language;
    const rest = Array.from(n.languages ?? []);
    const all = [primary, ...rest].filter(
      (l): l is string => typeof l === "string" && l.length > 0,
    );
    return Array.from(new Set(all));
  } catch {
    return [];
  }
}
