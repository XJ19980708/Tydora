#!/usr/bin/env node
/**
 * 从本地 git 历史生成结构化更新说明，供「关于 → 版本更新说明」展示。
 *
 * 分组规则与 cliff.toml 保持一致，但不依赖 git-cliff（它未作为项目依赖安装），
 * 因此离线可用；同时因为读取的是本地历史，fork 上的本地提交也会被收录。
 * 例外：fork 合并上游后产生的重建锁文件 / 重生成数据类 chore 会被过滤掉。
 *
 * 版本分段：每个 tag 一行（范围 = 上一个更旧的 tag .. 本 tag），最新 tag 之后的
 * 提交归入 VERSION 对应的"当前版本"行；该版本号已经打过 tag 时（fork 跟随上游
 * 版本号时的常态）直接并进那一行，保证同一版本号只出现一次。
 *
 * 输出：app/tydora-web/src/data/release-notes.json
 * 非 git 环境（如打包后的源码副本）不会报错，保留已有文件并退出 0。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = resolve(ROOT, "app/tydora-web/src/data/release-notes.json");

/** 与 cliff.toml 的 commit_parsers 顺序一致 */
const GROUP_ORDER = ["feat", "fix", "perf", "refactor", "docs", "style", "test", "ci", "build", "chore"];
const OTHER_GROUP = "other";

const CONVENTIONAL = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?!?:\s*(?<desc>.+)$/;
const TYPE_WORDS = "feat|fix|perf|refactor|docs|style|test|ci|build|chore";

/**
 * 有些提交把多条 conventional 消息写进同一个段落（每条一行），
 * git 的 %s 会把段内换行折成空格，于是几条变更挤成一条超长条目。
 * 这里按 type 前缀把它们切回各自的一条，各归各的组。
 */
const MULTIPART = new RegExp(`\\s(?=(?:${TYPE_WORDS})(?:\\([^)]*\\))?!?:\\s)`, "i");

function splitSubject(subject) {
  const parts = subject
    .split(MULTIPART)
    .map((s) => s.trim())
    .filter(Boolean);
  // 只有每一段都合法才切开，避免误伤正文里恰好出现 "feat: " 之类的普通提交
  if (parts.length < 2 || !parts.every((p) => CONVENTIONAL.test(p))) return [subject];
  return parts;
}

/**
 * fork 每次合并上游都要产生的本地维护提交（重建锁文件、重生成更新说明数据）。
 * 它们对用户没有意义，且措辞高度固定，直接丢弃；上游自己的 chore 不受影响。
 */
const HOUSEKEEPING_GROUPS = new Set(["chore", "build", "ci"]);
const HOUSEKEEPING = /^合并.*(重建|重新生成)/;

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** 解析 `hash\tsubject` 形式的提交列表，按 conventional type 分组 */
function collectGroups(range) {
  let raw = "";
  try {
    raw = git(["log", "--no-merges", "--pretty=format:%h%x09%s", range]);
  } catch {
    return [];
  }
  if (!raw) return [];

  const byType = new Map();
  // git log 新→旧，先倒成旧→新，同一条提交切开的片段顺序才不会被倒掉
  for (const line of raw.split("\n").reverse()) {
    const sep = line.indexOf("\t");
    if (sep < 0) continue;
    const hash = line.slice(0, sep);
    const subject = line.slice(sep + 1).trim();
    for (const piece of splitSubject(subject)) {
      const match = CONVENTIONAL.exec(piece);
      if (!match) continue; // 与 cliff.toml 的 filter_unconventional = true 对齐
      const type = match.groups.type.toLowerCase();
      const group = GROUP_ORDER.includes(type) ? type : OTHER_GROUP;
      const desc = match.groups.desc.trim();
      if (HOUSEKEEPING_GROUPS.has(group) && HOUSEKEEPING.test(desc)) continue;
      if (!byType.has(group)) byType.set(group, []);
      byType.get(group).push({ text: desc, hash });
    }
  }

  return sortGroups(byType);
}

/** 按 cliff.toml 的组顺序排列（feat → chore → other），组内保持传入顺序 */
function sortGroups(byType) {
  return [...byType.entries()]
    .filter(([, items]) => items.length)
    .sort((a, b) => {
      const ai = a[0] === OTHER_GROUP ? GROUP_ORDER.length : GROUP_ORDER.indexOf(a[0]);
      const bi = b[0] === OTHER_GROUP ? GROUP_ORDER.length : GROUP_ORDER.indexOf(b[0]);
      return ai - bi;
    })
    .map(([group, items]) => ({ group, items }));
}

/**
 * 把 secondary 的分组并进 primary：同 hash 的条目只保留一次，
 * 组顺序按 GROUP_ORDER 重排。用于「当前版本」与同名 tag 行合并。
 */
function mergeGroups(primary, secondary) {
  const byType = new Map();
  for (const { group, items } of [...primary, ...secondary]) {
    if (!byType.has(group)) byType.set(group, []);
    const merged = byType.get(group);
    for (const item of items) {
      // 同一条提交切开后可能生成多个条目（共用 hash），所以去重要带上文本
      const dup = merged.some((existing) => existing.hash === item.hash && existing.text === item.text);
      if (!dup) merged.push(item);
    }
  }
  return sortGroups(byType);
}

function tagDate(tag) {
  try {
    return git(["log", "-1", "--format=%cs", tag]);
  } catch {
    return "";
  }
}

function readVersionFile() {
  try {
    return readFileSync(resolve(ROOT, "VERSION"), "utf8").trim();
  } catch {
    return "";
  }
}

function main() {
  let tags;
  try {
    tags = git(["tag", "-l", "v*", "--sort=-v:refname"])
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
  } catch {
    console.warn("[release-notes] 无法读取 git tag（非 git 环境？），保留现有文件");
    return;
  }

  const versions = [];

  // 先建 tag 行：范围是「上一个更旧的 tag .. 本 tag」
  const tagRows = [];
  for (let i = 0; i < tags.length; i++) {
    const range = i + 1 < tags.length ? `${tags[i + 1]}..${tags[i]}` : tags[i];
    const groups = collectGroups(range);
    if (!groups.length) continue;
    tagRows.push({
      version: tags[i].replace(/^v/, ""),
      date: tagDate(tags[i]),
      released: true,
      groups,
    });
  }

  // 最新 tag 之后的提交归入"当前版本"（可能尚未打 tag）。
  // 若 VERSION 已经打过同名 tag（fork 跟随上游版本号时的常态），不再另起一行，
  // 而是并进那一行：否则会出现两条同名版本，而弹框用 version 当 React key
  // 与展开状态的键，重名会串台。
  const headRange = tags.length ? `${tags[0]}..HEAD` : "HEAD";
  const headGroups = collectGroups(headRange);
  const currentVersion = readVersionFile();
  const currentTagRow = tagRows.find((row) => row.version === currentVersion);

  if (headGroups.length && currentTagRow) {
    currentTagRow.groups = mergeGroups(currentTagRow.groups, headGroups);
  } else if (headGroups.length) {
    let date = "";
    try {
      date = git(["log", "-1", "--format=%cs"]);
    } catch { /* 忽略 */ }
    versions.push({
      version: currentVersion || "unreleased",
      date,
      released: false,
      groups: headGroups,
    });
  }

  versions.push(...tagRows);

  if (!versions.length) {
    console.warn("[release-notes] 未解析到任何条目，保留现有文件");
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    current: currentVersion || (tags[0] ? tags[0].replace(/^v/, "") : ""),
    versions,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (existsSync(OUT_FILE) && readFileSync(OUT_FILE, "utf8") === json) {
    console.log(`[release-notes] 无变化（${versions.length} 个版本）`);
    return;
  }
  writeFileSync(OUT_FILE, json, "utf8");
  console.log(`[release-notes] 已生成 ${versions.length} 个版本 → ${OUT_FILE}`);
}

main();
