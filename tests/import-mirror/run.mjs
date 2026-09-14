// 「导入镜像 / 手动重新同步」测试的运行器：npm test
//
// 做法：用 esbuild（vite 自带，无新增依赖）把真实的 importMirror.ts 连同 case.ts
// 打成一个 Node 可执行的 ESM bundle，构建时用 onResolve/onLoad 插件把 Tauri 的
// IPC 边界替换为 node:fs 实现，然后 import 这个 bundle 跑断言。
//
// 关键点：case.ts 的沙盒路径取自 process.cwd()，所以进入前必须 chdir 到仓库根，
// 保证 `npm test` 从任何目录调用都落在同一个沙盒 .build/test-import-mirror/。

import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
process.chdir(repoRoot);

const outfile = path.join(repoRoot, ".build", "import-mirror-test.bundle.mjs");

// ---------------------------------------------------------- Tauri 边界替身

const FS_STUB = `
import fs from "node:fs";
import path from "node:path";
export function copyFile(src, dest) { return fs.promises.copyFile(src, dest); }
export function exists(p) { return Promise.resolve(fs.existsSync(p)); }
export function mkdir(p, opts) { fs.mkdirSync(p, { recursive: !!(opts && opts.recursive) }); return Promise.resolve(); }
export function writeFile(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); return fs.promises.writeFile(p, data); }
export function writeTextFile(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); return fs.promises.writeFile(p, data, "utf8"); }
export function readTextFile(p) { return fs.promises.readFile(p, "utf8"); }
export function readDir(p) {
  try {
    return Promise.resolve(fs.readdirSync(p).map((name) => {
      const st = fs.statSync(path.join(p, name));
      return { name, isDirectory: st.isDirectory(), isFile: st.isFile() };
    }));
  } catch (e) { return Promise.reject(e); }
}
`;

// list_dir_with_meta 的 Rust 实现（file_commands.rs）：mtime 取 ms 后 as_millis() 截断为整数。
const CORE_STUB = `
import fs from "node:fs";
import path from "node:path";
export function invoke(cmd, args) {
  if (cmd === "list_dir_with_meta") {
    const dirPath = args && args.dirPath;
    try {
      return Promise.resolve(fs.readdirSync(dirPath, { withFileTypes: true }).map((e) => {
        let mtime = null, ctime = null;
        try {
          const st = fs.statSync(path.join(dirPath, e.name));
          mtime = Math.floor(st.mtimeMs);
          ctime = Math.floor(st.birthtimeMs);
        } catch {}
        return { name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile(), mtime, ctime };
      }));
    } catch { return Promise.resolve([]); }
  }
  throw new Error("harness: 未预期的 invoke 调用 " + cmd);
}
export function convertFileSrc(p) { return p; }
`;

const STUBS = {
  "@tauri-apps/plugin-fs": FS_STUB,
  "@tauri-apps/api/core": CORE_STUB,
  "@tauri-apps/plugin-dialog": `export function open() { throw new Error("harness: 原生对话框不可用"); }`,
  "@tauri-apps/api/event": `export function listen() { return Promise.resolve(() => {}); }`,
  "@tauri-apps/api/window": `export default {};`,
};

const stubPlugin = {
  name: "stub-tauri",
  setup(build) {
    build.onResolve({ filter: /^@tauri-apps\// }, (a) => ({ path: a.path, namespace: "stub" }));
    build.onResolve({ filter: /(^|[\\/])i18n$/ }, () => ({ path: "__i18n__", namespace: "stub" }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, (a) => {
      if (a.path === "__i18n__") {
        return {
          contents: `const t = (k) => k; export default { t, on(){}, off(){}, changeLanguage(){ return Promise.resolve(); } };`,
          loader: "js",
        };
      }
      const contents = STUBS[a.path] ?? `export default {}; export const __stub = true;`;
      return { contents, loader: "js" };
    });
  },
};

// ---------------------------------------------------------- 构建 + 执行

function indent(text) {
  return String(text).split("\n").map((l) => `      ${l}`).join("\n");
}

fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.rmSync(outfile, { force: true });

try {
  await esbuild.build({
    entryPoints: [path.join(here, "case.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "warning",
    plugins: [stubPlugin],
    banner: { js: "// 由 tests/import-mirror/run.mjs 用 esbuild 生成的临时 bundle（真实源码 + node:fs 替身）" },
  });
} catch (err) {
  console.error("构建测试 bundle 失败：");
  console.error(err);
  process.exit(1);
}

const mod = await import(pathToFileURL(outfile).href);
const cases = mod.cases();

console.log(`导入镜像测试：共 ${cases.length} 个用例\n`);

let passed = 0;
let failed = 0;
let totalAssertions = 0;

for (const testCase of cases) {
  mod.resetAssertionCount();
  try {
    await testCase.run();
    const n = mod.assertionCount();
    totalAssertions += n;
    passed++;
    console.log(`  ✓ ${testCase.name}  (${n} 项断言)`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${testCase.name}`);
    console.error(indent(err && err.stack ? err.stack : err));
  }
}

fs.rmSync(outfile, { force: true });

console.log(`\n结果：${passed} 通过 / ${failed} 失败，共 ${totalAssertions} 项断言`);

if (failed === 0) {
  // 全部通过 → 清掉沙盒，别在 .build/ 里留垃圾
  fs.rmSync(path.join(repoRoot, ".build", "test-import-mirror"), { recursive: true, force: true });
  console.log("沙盒已清理：.build/test-import-mirror/");
} else {
  console.log("沙盒保留供排查：.build/test-import-mirror/");
}

process.exit(failed === 0 ? 0 : 1);
