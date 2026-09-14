// 「导入镜像 / 手动重新同步」的回归测试用例。
//
// 这段代码跑的是**仓库里真实的** app/tydora-web/src/services/importMirror.ts，
// 只把 Tauri 的 IPC 边界换成 node:fs 替身（映射见 tests/import-mirror/run.mjs），
// 其余逻辑（mtime 三分、冲突判定、源删除不删目标、映射回写…）全部是真代码。
//
// 沙盒固定为仓库内被 gitignore 的 .build/test-import-mirror/，全程不碰任何真实仓库。
// 运行：npm test

import fs from "node:fs";
import path from "node:path";
import {
  IMPORT_MAPPING_FILE,
  addImportRecords,
  applyImportSync,
  fromVaultRelative,
  loadImportMapping,
  planImportSync,
  removeImportRecord,
  toVaultRelative,
  type ImportRecord,
} from "../../app/tydora-web/src/services/importMirror";

// importMirror 的 pathSep() 读 navigator.platform；Node 里补一个 Win32 语义的替身。
// （真机是 Windows，这里跟着走同一分支，保证路径拼法与生产一致。）
try {
  Object.defineProperty(globalThis, "navigator", { value: { platform: "Win32" }, configurable: true });
} catch {
  (globalThis as unknown as { navigator: unknown }).navigator = { platform: "Win32" };
}

export const SANDBOX = path.resolve(process.cwd(), ".build/test-import-mirror");
const SRC = path.join(SANDBOX, "fixture-src");
const SRC_GONE = path.join(SANDBOX, "fixture-src-moved");
const VAULT = path.join(SANDBOX, "vault");
const DEST_REL = "fixture-src";
const DEST = path.join(VAULT, DEST_REL);

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC";

// ---------------------------------------------------------------- 极简断言

class AssertionError extends Error {}

let assertions = 0;

export function assertionCount(): number {
  return assertions;
}
export function resetAssertionCount(): void {
  assertions = 0;
}

function eq(actual: unknown, expected: unknown, what: string): void {
  assertions++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new AssertionError(`${what}\n      期望 ${e}\n      实际 ${a}`);
}

function ok(cond: boolean, what: string): void {
  assertions++;
  if (!cond) throw new AssertionError(what);
}

export interface TestCase {
  name: string;
  run: () => Promise<void>;
}

const registry: TestCase[] = [];

function test(name: string, run: () => Promise<void>): void {
  registry.push({ name, run });
}

// ---------------------------------------------------------------- 文件工具

function put(p: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}
/** 把 mtime 推到「现在 + offsetSec 秒」，用来构造「源更新 / 目标被本地改新」这类时序。 */
function setMtime(p: string, offsetSec: number): void {
  const t = new Date(Date.now() + offsetSec * 1000);
  fs.utimesSync(p, t, t);
}
function exists(p: string): boolean {
  return fs.existsSync(p);
}
/** 列出目录树里参与镜像的文件的仓库相对路径（跳过 "." 开头的隐藏项）。 */
function treeRels(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else out.push(r);
    }
  };
  walk(root, "");
  return out.sort();
}
function planRels(list: ReadonlyArray<{ rel: string }>): string[] {
  return list.map((f) => f.rel).sort();
}

const MIRRORABLE = /\.(md|markdown|mdx|png|jpe?g|gif|webp|svg)$/i;

/** 模拟前端「导入文件夹」：递归复制 md + 图片进落点，然后登记映射。 */
async function initialImport(): Promise<void> {
  const files = treeRels(SRC).filter((r) => MIRRORABLE.test(r));
  for (const r of files) {
    const to = path.join(DEST, r.split("/").join(path.sep));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(SRC, r.split("/").join(path.sep)), to);
  }
  await addImportRecords(VAULT, [
    { source: SRC, dest: DEST_REL, kind: "folder", lastSyncAt: new Date().toISOString(), files },
  ]);
}

/** 从映射表里读回当前 folder 记录（和 UI 每次都从磁盘读的行为一致）。 */
async function folderRecord(): Promise<ImportRecord> {
  const mapping = await loadImportMapping(VAULT);
  const rec = mapping.imports.find((r) => r.source === SRC && r.dest === DEST_REL);
  if (!rec) throw new AssertionError(`映射表里找不到记录：${SRC} → ${DEST_REL}`);
  return rec;
}

const mappingPath = (): string => path.join(VAULT, IMPORT_MAPPING_FILE);

// ---------------------------------------------------------------- 用例

test("目录镜像：登记 → 首次同步 → 源更新 → 新增 → 冲突 → 源删除 → 源消失 → 图片", async () => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(VAULT, { recursive: true });
  put(path.join(SRC, "note-a.md"), "# Note A v1\n\noriginal content, revision 1\n");
  put(path.join(SRC, "sub", "note-b.md"), "# Note B\n\nnested note\n");
  put(path.join(SRC, "img", "pic.png"), Buffer.from(PNG_B64, "base64"));
  put(path.join(SRC, "skip-me.txt"), "not a note");

  // —— 导入即登记映射
  await initialImport();
  ok(exists(mappingPath()), `映射表应写在仓库根：${mappingPath()}`);
  const saved = JSON.parse(read(mappingPath()));
  eq(saved.version, 1, "映射表 version");
  eq(saved.imports.length, 1, "只登记 1 条 folder 记录");
  eq(saved.imports[0].source, SRC, "记录的 source 是源绝对路径");
  eq(saved.imports[0].dest, DEST_REL, "记录的 dest 是仓库内相对路径（/ 分隔）");
  eq(saved.imports[0].kind, "folder", "记录的 kind");
  eq(saved.imports[0].files, ["img/pic.png", "note-a.md", "sub/note-b.md"], "只镜像 md + 图片，跳过 .txt");
  ok(exists(path.join(DEST, "img", "pic.png")), "图片应被复制进仓库");

  // —— 导入后立刻同步：必须全部「未变」，否则会出现无意义的反复覆盖
  {
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(planRels(plan.toAdd), [], "首次同步无待新增");
    eq(planRels(plan.toUpdate), [], "首次同步无待更新（依赖 Windows 复制保留 mtime）");
    eq(planRels(plan.conflicts), [], "首次同步无冲突");
    eq(plan.unchanged, 3, "首次同步 3 个文件判为未变");
    eq(plan.sourceMissing, false, "源存在");
  }

  // —— 源更新一个文件 → 待更新并覆盖
  {
    put(path.join(SRC, "note-a.md"), "# Note A v2\n\nsource changed\n");
    setMtime(path.join(SRC, "note-a.md"), 5);
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(planRels(plan.toUpdate), ["note-a.md"], "源更新 → 待更新");
    eq(plan.unchanged, 2, "其余 2 个未变");
    const res = await applyImportSync(VAULT, await folderRecord(), plan);
    eq(res, { added: 0, updated: 1, overwritten: 0, unchanged: 2, removed: 0, failed: 0 }, "同步结果计数");
    ok(read(path.join(DEST, "note-a.md")).includes("v2"), "仓库内内容应跟随源");
  }

  // —— 幂等：紧接着再同步不应有任何动作
  {
    const plan = await planImportSync(VAULT, await folderRecord());
    eq([planRels(plan.toAdd), planRels(plan.toUpdate), planRels(plan.conflicts)], [[], [], []], "二次同步无事可做");
    eq(plan.unchanged, 3, "二次同步 3 个文件未变");
  }

  // —— 源新增子目录文件
  {
    put(path.join(SRC, "sub", "note-c.md"), "# Note C\n");
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(planRels(plan.toAdd), ["sub/note-c.md"], "源新增 → 待新增");
    const res = await applyImportSync(VAULT, await folderRecord(), plan);
    eq(res.added, 1, "新增 1 个");
    ok(exists(path.join(DEST, "sub", "note-c.md")), "新文件落到仓库内同名子目录");
    const rec = await folderRecord();
    eq((rec.files ?? []).length, 4, "记录的 files 写回后含 4 项");
  }

  // —— 目标比源新（仓库内被本地改过）→ 进 conflicts，必须确认后才覆盖
  {
    setMtime(path.join(DEST, "note-a.md"), 30);
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(planRels(plan.conflicts), ["note-a.md"], "目标更新 → 冲突");
    eq(planRels(plan.toUpdate), [], "冲突不应同时出现在待更新里");
    // 真实 UI 在此处停下等用户点「覆盖并同步」；确认后才调 applyImportSync
    const res = await applyImportSync(VAULT, await folderRecord(), plan);
    eq(res.overwritten, 1, "确认后覆盖 1 个");
    eq(read(path.join(DEST, "note-a.md")), read(path.join(SRC, "note-a.md")), "覆盖后内容等于源");
  }

  // —— 源删除文件：只报告，绝不删目标
  {
    fs.rmSync(path.join(SRC, "sub", "note-b.md"));
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(plan.removed, ["sub/note-b.md"], "源删除 → 进 removed 报告");
    eq([planRels(plan.toAdd), planRels(plan.toUpdate), planRels(plan.conflicts)], [[], [], []], "源删除不产生待办");
    const res = await applyImportSync(VAULT, await folderRecord(), plan);
    eq(res.removed, 1, "结果里 removed=1");
    ok(exists(path.join(DEST, "sub", "note-b.md")), "仓库内被源删掉的文件必须保留（约定：不自动删目标）");
  }

  // —— 源整棵目录消失：什么都不做
  {
    fs.renameSync(SRC, SRC_GONE);
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(plan.sourceMissing, true, "源缺失标记");
    eq([planRels(plan.toAdd), planRels(plan.toUpdate), planRels(plan.conflicts)], [[], [], []], "源缺失时不产生待办");
    const before = treeRels(DEST);
    await applyImportSync(VAULT, await folderRecord(), plan);
    eq(treeRels(DEST), before, "源缺失时目标一个文件都不动");
    fs.renameSync(SRC_GONE, SRC);
  }

  // —— 图片也在镜像范围内
  {
    const png2 = Buffer.from(PNG_B64, "base64");
    png2[20] = (png2[20] + 1) & 0xff;
    put(path.join(SRC, "img", "pic.png"), png2);
    setMtime(path.join(SRC, "img", "pic.png"), 40);
    const plan = await planImportSync(VAULT, await folderRecord());
    eq(planRels(plan.toUpdate), ["img/pic.png"], "源图片变更 → 待更新");
    const res = await applyImportSync(VAULT, await folderRecord(), plan);
    eq(res.updated, 1, "图片更新计数");
    ok(fs.readFileSync(path.join(DEST, "img", "pic.png")).equals(png2), "仓库内图片字节应与源一致");
  }
});

test("单文件镜像：kind=file 的新增 / 幂等 / 源消失", async () => {
  const loose = path.join(SANDBOX, "loose.md");
  const destRel = "loose-copy.md";
  put(loose, "# loose v1\n");
  const rec: ImportRecord = { source: loose, dest: destRel, kind: "file", lastSyncAt: null };
  await addImportRecords(VAULT, [rec]);

  const plan = await planImportSync(VAULT, rec);
  eq(planRels(plan.toAdd), [destRel], "单文件：源新于缺失的目标 → 待新增");
  eq(plan.sourceRels, [destRel], "单文件的 sourceRels 就是落点本身");
  await applyImportSync(VAULT, rec, plan);
  ok(exists(path.join(VAULT, destRel)), "单文件应被复制进仓库");

  const plan2 = await planImportSync(VAULT, rec);
  eq(plan2.unchanged, 1, "单文件二次同步判为未变");

  fs.rmSync(loose);
  const plan3 = await planImportSync(VAULT, rec);
  eq(plan3.sourceMissing, true, "源文件消失 → sourceMissing");
  ok(exists(path.join(VAULT, destRel)), "源消失时仓库内副本保留");
});

test("映射表：去重 / 移除 / 坏文件容错 / 字段过滤", async () => {
  // 用独立仓库，避免与上面的生命周期互相影响
  const vault2 = path.join(SANDBOX, "vault2");
  fs.rmSync(vault2, { recursive: true, force: true });
  fs.mkdirSync(vault2, { recursive: true });
  const file = path.join(vault2, IMPORT_MAPPING_FILE);

  // 空数组 → no-op
  await addImportRecords(vault2, []);
  ok(!exists(file), "记录为空时不应写出映射表");

  // 同「源 + 落点」重复登记 → 覆盖旧记录而不是追加
  const a: ImportRecord = { source: "S:/a", dest: "a", kind: "folder", lastSyncAt: "2026-01-01T00:00:00Z", files: ["a.md"] };
  const b: ImportRecord = { source: "S:/b", dest: "b", kind: "file", lastSyncAt: "2026-01-01T00:00:00Z" };
  await addImportRecords(vault2, [a, b]);
  await addImportRecords(vault2, [{ ...a, lastSyncAt: "2026-02-02T00:00:00Z" }]);
  let mapping = await loadImportMapping(vault2);
  eq(mapping.imports.length, 2, "同源同落点不重复追加");
  eq(
    mapping.imports.find((r) => r.source === a.source)?.lastSyncAt,
    "2026-02-02T00:00:00Z",
    "重复登记应覆盖旧值",
  );

  // 移除一条，另一条保留
  await removeImportRecord(vault2, a);
  mapping = await loadImportMapping(vault2);
  eq(mapping.imports.length, 1, "移除后只剩 1 条");
  eq(mapping.imports[0].source, b.source, "保留的是另一条");
  eq(JSON.parse(read(file)).version, 1, "移除后映射表仍是合法 JSON");

  // 坏文件 → 视为空表而不是抛错
  fs.writeFileSync(file, "{ 这不是合法 JSON");
  mapping = await loadImportMapping(vault2);
  eq(mapping, { version: 1, imports: [] }, "映射表损坏时退化为空表");

  // 缺字段的记录被过滤掉
  fs.writeFileSync(file, JSON.stringify({ version: 1, imports: [{ source: "x", dest: "y" }, { ...b }] }));
  mapping = await loadImportMapping(vault2);
  eq(mapping.imports.length, 1, "缺 kind 的记录被过滤");
  eq(mapping.imports[0].source, b.source, "合法记录保留");
});

test("路径换算：仓库相对 ↔ 绝对", () => {
  const vault = "C:\\vault";
  eq(toVaultRelative(vault, "C:\\vault\\子目录\\a.md"), "子目录/a.md", "仓库内 → 相对路径，用 / 分隔");
  eq(toVaultRelative(vault, "C:/vault/子目录/a.md"), "子目录/a.md", "正斜杠输入同样归一");
  eq(toVaultRelative(vault, "C:\\vault"), "", "仓库根自身 → 空串");
  eq(toVaultRelative(vault, "D:\\elsewhere\\a.md"), "D:/elsewhere/a.md", "仓库外 → 原样返回（调用方据此跳过登记）");
  eq(toVaultRelative(vault, "C:\\vaultish\\a.md"), "C:/vaultish/a.md", "同前缀但不是仓库内 → 不算命中");

  eq(fromVaultRelative(vault, "子目录/a.md"), "C:\\vault\\子目录\\a.md", "相对 → 绝对（Windows 用反斜杠）");
  const roundTrip = fromVaultRelative(vault, toVaultRelative(vault, "C:\\vault\\x\\b.md"));
  eq(roundTrip, "C:\\vault\\x\\b.md", "往返一致");
});

export function cases(): TestCase[] {
  return registry;
}
