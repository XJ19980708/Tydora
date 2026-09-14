import { Node, nodeInputRule, mergeAttributes } from "@tiptap/core";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import i18n from "../../i18n";

/**
 * [TOC] 内容目录节点。
 *
 * - Markdown 源码：独占一行的 `[TOC]`（大小写不敏感）
 * - IR 模式：atom 节点，NodeView 实时渲染文档标题的嵌套目录，
 *   点击条目跳转到对应标题并高亮
 * - 序列化：getMarkdown 写回 `[TOC]`，往返无损
 */

interface HeadingEntry {
  level: number;
  text: string;
  /** heading 节点在 doc 中的起始位置（可直接用于 setTextSelection） */
  pos: number;
}

function collectHeadings(doc: ProsemirrorNode): HeadingEntry[] {
  const entries: HeadingEntry[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      const text = node.textContent.trim();
      if (text) entries.push({ level: node.attrs.level as number, text, pos });
    }
    return true;
  });
  return entries;
}

export const Toc = Node.create({
  name: "toc",
  // parse 规则要先于 paragraph：markdown-it 把 `[TOC]` 渲染成 <p>[TOC]</p>，
  // 必须让本节点优先把它认领为 toc 节点而不是普通段落
  priority: 200,

  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [
      { tag: "div[data-toc]" },
      {
        tag: "p",
        getAttrs: (element) => {
          const text = (element as HTMLElement).textContent?.trim().toLowerCase();
          return text === "[toc]" ? {} : null;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toc": "true", class: "toc-block" })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("[TOC]");
          state.closeBlock(node);
        },
        parse: {
          // 由 markdown-it 渲染 <p>[TOC]</p> + 上面的 parseHTML 规则处理
        },
      },
    };
  },

  // 输入 `[toc]` + 空格 → 转换为目录节点
  addInputRules() {
    return [
      nodeInputRule({
        find: /^\s*\[toc\]\s$/i,
        type: this.type,
      }),
    ];
  },

  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("div");
      dom.className = "toc-block";
      dom.setAttribute("data-toc", "true");

      const render = () => {
        dom.textContent = "";
        const entries = collectHeadings(editor.state.doc);

        const title = document.createElement("div");
        title.className = "toc-block-title";
        title.textContent = i18n.t("editor.tocBlock.title");
        dom.appendChild(title);

        if (entries.length === 0) {
          const empty = document.createElement("div");
          empty.className = "toc-block-empty";
          empty.textContent = i18n.t("editor.tocBlock.empty");
          dom.appendChild(empty);
          return;
        }

        const baseLevel = entries[0].level;
        for (const entry of entries) {
          const item = document.createElement("div");
          item.className = "toc-entry";
          item.style.paddingLeft = `${Math.max(0, entry.level - baseLevel) * 18}px`;
          item.textContent = entry.text;
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              editor.chain().focus().setTextSelection(entry.pos).run();
            } catch {
              return;
            }
            requestAnimationFrame(() => {
              const scrollContainer = dom.closest(".tiptap-editor");
              if (!scrollContainer) return;
              try {
                const coords = editor.view.coordsAtPos(entry.pos);
                if (coords) {
                  const rect = scrollContainer.getBoundingClientRect();
                  scrollContainer.scrollTop += coords.top - rect.top - 20;
                }
              } catch {
                /* 节点可能已被删除 */
              }
            });
          });
          dom.appendChild(item);
        }
      };

      render();

      // 文档变化时重建目录（位置与条目都会变）
      const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
        if (transaction.docChanged) render();
      };
      editor.on("transaction", onTransaction);

      return {
        dom,
        update(updatedNode) {
          return updatedNode.type.name === "toc";
        },
        ignoreMutation: () => true,
        // 只拦截目录条目上的事件（跳转），其余交给 ProseMirror（点击空白可选中节点）
        stopEvent: (event: Event) => {
          const target = event.target as HTMLElement | null;
          return !!target?.closest?.(".toc-entry");
        },
        destroy() {
          editor.off("transaction", onTransaction);
        },
      };
    };
  },
});
