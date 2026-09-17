/**
 * TOC 的 markdown 解析规则（不含 i18n / 编辑器运行时依赖，便于单元测试直接运行）。
 *
 * 两条互补的解析能力：
 * 1. isTocLine：判断一段 <p> 文本是否为独立的 `[TOC]`（供 parseHTML 规则使用）
 * 2. installTocBlockRule：让 markdown-it 把独立 `[TOC]` 行直接渲染成
 *    <div data-toc="true"></div>，从而走 `div[data-toc]` 这条无歧义的 parseHTML 规则 ——
 *    不依赖扩展优先级排序，重开文件 / 外部刷新 / 粘贴等所有重新解析路径都能稳定还原。
 *
 * 注：本模块刻意不引入其他相对模块（node --experimental-strip-types 要求相对导入带扩展名），
 * 幂等标记与 extensions/markdown-setup.ts 共用同一个 md.__tydoraMarkdownRules 命名空间。
 */

/** 独立一行的 [TOC]（大小写不敏感，允许两侧空白） */
export function isTocLine(text: string | null | undefined): boolean {
  return (text ?? "").trim().toLowerCase() === "[toc]";
}

function installOnce(md: any, key: string): boolean {
  if (!md || typeof md !== "object") return true;
  const flags: Record<string, boolean> = (md.__tydoraMarkdownRules ??= {});
  if (flags[key]) return false;
  flags[key] = true;
  return true;
}

/** 在 markdown-it 实例上安装 `[TOC]` → <div data-toc> 的转换规则（幂等） */
export function installTocBlockRule(md: any): void {
  // 规则只安装一次：tiptap-markdown 的 parse() 每次解析都会重跑 setup，
  // 而 markdown-it 的 ruler.push 不去重，不设防会随解析次数线性累加。
  if (!installOnce(md, "tydora_toc_block")) return;
  md.core.ruler.push("tydora_toc_block", (state: any) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (open.type !== "paragraph_open") continue;
      // 仅转换顶层段落：列表 / 引用内部的 [TOC]（level > 0）保持原样，
      // 否则会把容器结构（列表项等）拆出意外的层级
      if (open.level !== 0) continue;
      const inline = tokens[i + 1];
      const close = tokens[i + 2];
      // 只处理「整段就是 [TOC]」的段落：`[TOC]` 混在正文里不算
      if (!inline || inline.type !== "inline" || !close || close.type !== "paragraph_close") continue;
      if (!isTocLine(inline.content)) continue;
      const token = new state.Token("html_block", "", 0);
      token.content = '<div data-toc="true"></div>\n';
      token.map = open.map;
      tokens.splice(i, 3, token);
    }
    return true;
  });
}
