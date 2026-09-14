/**
 * 文件树类型图标：按目录 / 文件扩展名返回彩色 SVG。
 * 由通用设置「显示文件图标」（zmd-general-settings.showFileIcons）控制是否渲染。
 */
import type { ReactElement } from "react";

export type FileIconKind =
  | "folder"
  | "markdown"
  | "canvas"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "code"
  | "text"
  | "archive"
  | "file";

const EXT_KIND: Record<string, FileIconKind> = {
  // 文档
  md: "markdown",
  markdown: "markdown",
  // 白板画布
  canvas: "canvas",
  // 图片
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image",
  bmp: "image", ico: "image", avif: "image", svg: "image",
  // 视频
  mp4: "video", mkv: "video", avi: "video", mov: "video", wmv: "video",
  flv: "video", webm: "video", m4v: "video",
  // 音频
  mp3: "audio", wav: "audio", flac: "audio", ogg: "audio", oga: "audio",
  m4a: "audio", aac: "audio", opus: "audio",
  // PDF
  pdf: "pdf",
  // 代码 / 数据
  json: "code", ts: "code", tsx: "code", js: "code", jsx: "code", mjs: "code",
  cjs: "code", py: "code", pyw: "code", rs: "code", go: "code", java: "code",
  kt: "code", c: "code", h: "code", cpp: "code", hpp: "code", cc: "code",
  cs: "code", html: "code", htm: "code", css: "code", scss: "code", less: "code",
  xml: "code", yml: "code", yaml: "code", toml: "code", sh: "code", bat: "code",
  cmd: "code", ps1: "code", sql: "code", lua: "code", rb: "code", php: "code",
  swift: "code", vue: "code", svelte: "code",
  // 纯文本
  txt: "text", log: "text",
  // 压缩包
  zip: "archive", rar: "archive", "7z": "archive", gz: "archive",
  tar: "archive", bz2: "archive", xz: "archive",
};

export function getFileIconKind(name: string, isDirectory: boolean): FileIconKind {
  if (isDirectory) return "folder";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";
  return EXT_KIND[name.slice(dot + 1).toLowerCase()] ?? "file";
}

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...S}>
      {children}
    </svg>
  );
}

function KindIcon({ kind, expanded }: { kind: FileIconKind; expanded: boolean }) {
  switch (kind) {
    case "folder":
      return expanded ? (
        <IconSvg>
          <path d="M2 19V6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 2 19z" />
          <path d="M2 11h20" />
        </IconSvg>
      ) : (
        <IconSvg>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </IconSvg>
      );
    case "markdown":
      return (
        <IconSvg>
          <rect x="2" y="5.5" width="20" height="13" rx="2" />
          <path d="M5.5 15.5v-7l3 3.2 3-3.2v7" />
          <path d="M17.5 8.5v7m0 0-2.4-2.4m2.4 2.4 2.4-2.4" />
        </IconSvg>
      );
    case "canvas":
      return (
        <IconSvg>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <rect x="6.5" y="6.5" width="4.5" height="4.5" rx="1" />
          <circle cx="16" cy="15.5" r="2.2" />
          <path d="M11 9.5 14.3 14" />
        </IconSvg>
      );
    case "image":
      return (
        <IconSvg>
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
          <circle cx="8.5" cy="8.5" r="1.6" />
          <path d="m21 15-4.5-4.5L5 21" />
        </IconSvg>
      );
    case "video":
      return (
        <IconSvg>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
          <path d="m10 9 5 3-5 3z" />
        </IconSvg>
      );
    case "audio":
      return (
        <IconSvg>
          <path d="M9 18V5.5L20 4v11.5" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="17.5" cy="15.5" r="2.5" />
        </IconSvg>
      );
    case "pdf":
      return (
        <IconSvg>
          <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
          <path d="M14 2.5v6h6" />
          <path d="M8 15h8M8 18h5" />
        </IconSvg>
      );
    case "code":
      return (
        <IconSvg>
          <path d="m8.5 8-4.5 4 4.5 4" />
          <path d="m15.5 8 4.5 4-4.5 4" />
          <path d="m13 5.5-2 13" />
        </IconSvg>
      );
    case "text":
      return (
        <IconSvg>
          <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
          <path d="M14 2.5v6h6" />
          <path d="M8 13h8M8 16.5h8M8 20h5" />
        </IconSvg>
      );
    case "archive":
      return (
        <IconSvg>
          <rect x="3.5" y="4" width="17" height="16.5" rx="2" />
          <path d="M11 4h2M11 7h2M11 10h2" />
          <rect x="10" y="13.5" width="4" height="3.5" rx="0.8" />
        </IconSvg>
      );
    default:
      return (
        <IconSvg>
          <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-11z" />
          <path d="M14 2.5v6h6" />
        </IconSvg>
      );
  }
}

export function FileTreeIcon({
  name,
  isDirectory,
  expanded = false,
}: {
  name: string;
  isDirectory: boolean;
  expanded?: boolean;
}): ReactElement {
  const kind = getFileIconKind(name, isDirectory);
  return (
    <span
      className={`tree-file-icon tree-fi-${kind}`}
      aria-hidden="true"
    >
      <KindIcon kind={kind} expanded={expanded} />
    </span>
  );
}
