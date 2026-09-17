/**
 * markdown-it 规则安装守卫。
 *
 * tiptap-markdown 的 MarkdownParser.parse() 每次解析都会重新调用所有扩展的
 * `markdown.parse.setup()`，而 markdown-it 的 ruler.push / before / after 都不做
 * 重名去重 —— 不设防时规则会随解析次数线性累加（同一规则被重复执行，渲染开销
 * 持续增长，长时间编辑 / 频繁外部刷新后明显变慢）。
 *
 * 用法：每个扩展的 setup 开头做一次安装判断：
 *
 *   setup(markdownit: any) {
 *     if (!installMarkdownRuleOnce(markdownit, "my_rule")) return;
 *     markdownit.core.ruler.push("my_rule", ...);
 *   }
 *
 * 标记挂在 markdown-it 实例上：编辑器重建会创建新的 MarkdownParser（新实例），
 * 标记随之重置，不会漏装。
 */
export function installMarkdownRuleOnce(md: any, key: string): boolean {
  if (!md || typeof md !== "object") return true;
  const flags: Record<string, boolean> = (md.__tydoraMarkdownRules ??= {});
  if (flags[key]) return false;
  flags[key] = true;
  return true;
}
