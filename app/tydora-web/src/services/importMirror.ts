// src/services/importMirror.ts
// 「导入镜像」：把一次导入登记为「源 → 仓库内落点」的映射，之后可手动重新同步。
//
// 语义（单向、源优先；源删除不删目标）：
// - 源新增 / 目标缺失        → 复制
// - 源比目标新              → 覆盖
// - 目标比源新（本地改过）  → 覆盖，但同步前会列出清单要求确认
// - 源已删除                → 不删目标，仅在结果里报告数量
//
// 镜像范围：Markdown（md/markdown/mdx）+ 图片（与索引扫描同一扩展名集合）。
// 变更检测用 mtime：Windows 的 CopyFile（std::fs::copy）会保留源修改时间，
// 所以覆盖后两侧 mtime 相等，下一次同步自然判定为「未变」，不会反复覆盖。

import { copyFile, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { dirName, joinPath } from "./ImageManager";
import { isScanImageFile } from "./vault-file-scanner";

/** 映射表落在仓库根；`.` 开头，文件树与索引扫描都会跳过它。 */
export const IMPORT_MAPPING_FILE = ".tydora-imports.json";

const MAPPING_VERSION = 1;
const MARKDOWN_EXT = new Set(["md", "markdown", "mdx"]);

export type ImportKind = "folder" | "file";

export interface ImportRecord {
  /** 源绝对路径（文件夹导入是目录，文件导入是单个文件） */
  source: string;
  /** 仓库内落点：相对仓库根、以 "/" 分隔 */
  dest: string;
  kind: ImportKind;
  /** 上次同步时间（ISO8601） */
  lastSyncAt: string | null;
  /** kind=folder：上次同步时源内被镜像文件的相对路径，用于报告「源已删除」 */
  files?: string[];
}

export interface ImportMapping {
  version: number;
  imports: ImportRecord[];
}

/** 一个待复制的文件（源、目标两侧绝对路径齐备） */
interface MirrorFile {
  /** 相对源根（kind=file 时即文件名） */
  rel: string;
  srcAbs: string;
  destAbs: string;
  mtime: number;
}

export interface SyncPlan {
  toAdd: MirrorFile[];
  toUpdate: MirrorFile[];
  /** 目标比源新：本地可能改过，需要确认后再覆盖 */
  conflicts: MirrorFile[];
  unchanged: number;
  /** 记录中存在、但源里已找不到的相对路径 */
  removed: string[];
  /** 本次源内参与镜像的全部相对路径（写回记录用） */
  sourceRels: string[];
  /** kind=file 且源文件已不存在 */
  sourceMissing: boolean;
}

export interface SyncResult {
  added: number;
  updated: number;
  overwritten: number;
  unchanged: number;
  removed: number;
  failed: number;
}

interface MetaEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  mtime: number | null;
}

/** 目录树里的一个文件（相对路径 + 绝对路径 + mtime） */
interface TreeFile {
  rel: string;
  abs: string;
  mtime: number;
}

function pathSep(): string {
  return navigator.platform?.toLowerCase().includes("win") ? "\\" : "/";
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

/** 绝对路径 → 仓库内相对路径（"/" 分隔）。不在仓库内时原样返回。 */
export function toVaultRelative(vaultPath: string, absPath: string): string {
  const v = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const a = absPath.replace(/\\/g, "/");
  const lowerA = a.toLowerCase();
  const lowerV = v.toLowerCase();
  if (lowerA === lowerV) return "";
  if (lowerA.startsWith(lowerV + "/")) return a.slice(v.length + 1);
  return a;
}

/** 仓库内相对路径 → 绝对路径 */
export function fromVaultRelative(vaultPath: string, rel: string): string {
  return joinPath(vaultPath, rel.split("/").join(pathSep()));
}

function isMirrorFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return MARKDOWN_EXT.has(ext) || isScanImageFile(name);
}

function recordKey(r: ImportRecord): string {
  return `${r.source}\u0000${r.dest}`;
}

async function listDir(dirPath: string): Promise<MetaEntry[]> {
  try {
    return await invoke<MetaEntry[]>("list_dir_with_meta", { dirPath });
  } catch {
    // 目录不存在或不可读：当作空目录
    return [];
  }
}

/** 递归收集目录下参与镜像的文件（跳过 "." 开头的隐藏项）。 */
async function walkMirrorFiles(rootDir: string): Promise<TreeFile[]> {
  const found: TreeFile[] = [];
  const walk = async (dir: string, relDir: string) => {
    for (const entry of await listDir(dir)) {
      if (!entry.name || entry.name.startsWith(".")) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = joinPath(dir, entry.name);
      if (entry.isDirectory) {
        await walk(abs, rel);
      } else if (isMirrorFile(entry.name)) {
        found.push({ rel, abs, mtime: entry.mtime ?? 0 });
      }
    }
  };
  await walk(rootDir, "");
  return found;
}

export async function loadImportMapping(vaultPath: string): Promise<ImportMapping> {
  try {
    const raw = await readTextFile(fromVaultRelative(vaultPath, IMPORT_MAPPING_FILE));
    const parsed = JSON.parse(raw) as ImportMapping;
    if (parsed && Array.isArray(parsed.imports)) {
      return {
        version: MAPPING_VERSION,
        imports: parsed.imports.filter((r) => r && r.source && r.dest && r.kind),
      };
    }
  } catch {
    // 首次使用 / 文件损坏 → 视为空表
  }
  return { version: MAPPING_VERSION, imports: [] };
}

async function saveImportMapping(vaultPath: string, mapping: ImportMapping): Promise<void> {
  await writeTextFile(
    fromVaultRelative(vaultPath, IMPORT_MAPPING_FILE),
    JSON.stringify({ version: MAPPING_VERSION, imports: mapping.imports }, null, 2),
  );
}

/** 写入导入记录：同「源 + 落点」视为同一条，覆盖旧记录。 */
export async function addImportRecords(vaultPath: string, records: ImportRecord[]): Promise<void> {
  if (records.length === 0) return;
  const mapping = await loadImportMapping(vaultPath);
  for (const rec of records) {
    const idx = mapping.imports.findIndex((r) => recordKey(r) === recordKey(rec));
    if (idx >= 0) mapping.imports[idx] = rec;
    else mapping.imports.push(rec);
  }
  await saveImportMapping(vaultPath, mapping);
}

/** 移除导入记录（不删除仓库内已导入的文件）。 */
export async function removeImportRecord(vaultPath: string, record: ImportRecord): Promise<void> {
  const mapping = await loadImportMapping(vaultPath);
  mapping.imports = mapping.imports.filter((r) => recordKey(r) !== recordKey(record));
  await saveImportMapping(vaultPath, mapping);
}

/**
 * 只做检查、不写盘：算出本次同步会新增 / 更新 / 覆盖哪些文件。
 * kind=file 时按单文件比较；kind=folder 时递归比较整棵源树。
 */
export async function planImportSync(vaultPath: string, record: ImportRecord): Promise<SyncPlan> {
  const plan: SyncPlan = {
    toAdd: [],
    toUpdate: [],
    conflicts: [],
    unchanged: 0,
    removed: [],
    sourceRels: [],
    sourceMissing: false,
  };

  if (record.kind === "file") {
    const srcName = baseName(record.source);
    const srcEntry = (await listDir(dirName(record.source))).find((e) => e.name === srcName);
    if (!srcEntry || srcEntry.isDirectory) {
      plan.sourceMissing = true;
      return plan;
    }
    plan.sourceRels = [record.dest];
    const destAbs = fromVaultRelative(vaultPath, record.dest);
    const destEntry = (await listDir(dirName(destAbs))).find((e) => e.name === baseName(destAbs));
    const item: MirrorFile = {
      rel: record.dest,
      srcAbs: record.source,
      destAbs,
      mtime: srcEntry.mtime ?? 0,
    };
    if (!destEntry) plan.toAdd.push(item);
    else classify(item, destEntry.mtime ?? 0, plan);
    return plan;
  }

  const srcRoot = record.source;
  const destRoot = fromVaultRelative(vaultPath, record.dest);
  if (!(await exists(srcRoot))) {
    // 源整个不见了：不删目标，仅提示源已不存在
    plan.sourceMissing = true;
    return plan;
  }
  const srcFiles = await walkMirrorFiles(srcRoot);
  const destFiles = new Map((await walkMirrorFiles(destRoot)).map((f) => [f.rel, f]));

  for (const src of srcFiles) {
    plan.sourceRels.push(src.rel);
    const item: MirrorFile = {
      rel: src.rel,
      srcAbs: src.abs,
      destAbs: joinPath(destRoot, src.rel.split("/").join(pathSep())),
      mtime: src.mtime,
    };
    const dest = destFiles.get(src.rel);
    if (!dest) plan.toAdd.push(item);
    else classify(item, dest.mtime, plan);
  }

  // 源里已经没有、但上次同步覆盖过的文件：只报告，不删目标
  const current = new Set(plan.sourceRels);
  plan.removed = (record.files ?? []).filter((rel) => !current.has(rel));
  return plan;
}

/** 源 / 目标 mtime 三分：源更新 → 待更新；目标更新 → 冲突（覆盖前需确认）；相等 → 未变。 */
function classify(item: MirrorFile, destMtime: number, plan: SyncPlan): void {
  if (item.mtime > destMtime) plan.toUpdate.push(item);
  else if (destMtime > item.mtime) plan.conflicts.push(item);
  else plan.unchanged++;
}

/**
 * 执行同步：按 plan 复制文件、写回记录（lastSyncAt / files）并落盘。
 * 调用方需先处理 plan.conflicts 的确认。
 */
export async function applyImportSync(
  vaultPath: string,
  record: ImportRecord,
  plan: SyncPlan,
): Promise<SyncResult> {
  const result: SyncResult = {
    added: 0,
    updated: 0,
    overwritten: 0,
    unchanged: plan.unchanged,
    removed: plan.removed.length,
    failed: 0,
  };

  const createdDirs = new Set<string>();
  const copyOne = async (item: MirrorFile, bucket: "added" | "updated" | "overwritten") => {
    try {
      const dir = dirName(item.destAbs);
      if (!createdDirs.has(dir)) {
        await mkdir(dir, { recursive: true });
        createdDirs.add(dir);
      }
      await copyFile(item.srcAbs, item.destAbs);
      result[bucket]++;
    } catch {
      result.failed++;
    }
  };

  for (const item of plan.toAdd) await copyOne(item, "added");
  for (const item of plan.toUpdate) await copyOne(item, "updated");
  for (const item of plan.conflicts) await copyOne(item, "overwritten");

  record.lastSyncAt = new Date().toISOString();
  if (record.kind === "folder") record.files = plan.sourceRels;

  const mapping = await loadImportMapping(vaultPath);
  const idx = mapping.imports.findIndex((r) => recordKey(r) === recordKey(record));
  if (idx >= 0) mapping.imports[idx] = record;
  else mapping.imports.push(record);
  await saveImportMapping(vaultPath, mapping);

  return result;
}
