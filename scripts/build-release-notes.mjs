#!/usr/bin/env node
/**
 * 从本地 git 历史生成结构化更新说明，供「关于 → 版本更新说明」展示。
 *
 * 分组规则与 cliff.toml 保持一致，但不依赖 git-cliff（它未作为项目依赖安装），
 * 因此离线可用；同时因为读取的是本地历史，fork 上的本地提交也会被收录。
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
  for (const line of raw.split("\n")) {
    const sep = line.indexOf("\t");
    if (sep < 0) continue;
    const hash = line.slice(0, sep);
    const subject = line.slice(sep + 1).trim();
    const match = CONVENTIONAL.exec(subject);
    if (!match) continue; // 与 cliff.toml 的 filter_unconventional = true 对齐
    const type = match.groups.type.toLowerCase();
    const group = GROUP_ORDER.includes(type) ? type : OTHER_GROUP;
    if (!byType.has(group)) byType.set(group, []);
    byType.get(group).push({ text: match.groups.desc.trim(), hash });
  }

  return [...byType.entries()]
    .sort((a, b) => {
      const ai = a[0] === OTHER_GROUP ? GROUP_ORDER.length : GROUP_ORDER.indexOf(a[0]);
      const bi = b[0] === OTHER_GROUP ? GROUP_ORDER.length : GROUP_ORDER.indexOf(b[0]);
      return ai - bi;
    })
    .map(([group, items]) => ({ group, items: items.reverse() })); // 组内按时间正序
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

  // 最新 tag 之后的提交归入"当前版本"（可能尚未打 tag）
  const headRange = tags.length ? `${tags[0]}..HEAD` : "HEAD";
  const headGroups = collectGroups(headRange);
  const currentVersion = readVersionFile();
  if (headGroups.length && currentVersion) {
    let date = "";
    try {
      date = git(["log", "-1", "--format=%cs"]);
    } catch { /* 忽略 */ }
    versions.push({ version: currentVersion, date, released: false, groups: headGroups });
  } else if (headGroups.length) {
    versions.push({ version: "unreleased", date: "", released: false, groups: headGroups });
  }

  // 逐个 tag：范围是「上一个更旧的 tag .. 本 tag」
  for (let i = 0; i < tags.length; i++) {
    const range = i + 1 < tags.length ? `${tags[i + 1]}..${tags[i]}` : tags[i];
    const groups = collectGroups(range);
    if (!groups.length) continue;
    versions.push({
      version: tags[i].replace(/^v/, ""),
      date: tagDate(tags[i]),
      released: true,
      groups,
    });
  }

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
