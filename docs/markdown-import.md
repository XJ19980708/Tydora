# Markdown 导入与导入镜像（重新同步）

本文档描述 Tydora 的两件相关功能：**导入**（把仓库**外部**的 Markdown 文件 / 整个目录树复制进当前仓库）与**重新同步**（导入时登记「源 → 仓库内位置」映射，源目录更新后手动单向拉取变更）。

---

## 目录

- [功能定位](#功能定位)
- [交互入口](#交互入口)
- [行为规则](#行为规则)
  - [复制而非移动](#复制而非移动)
  - [文件模式](#文件模式)
  - [文件夹模式](#文件夹模式)
  - [命名冲突：永不覆盖](#命名冲突永不覆盖)
  - [隐藏项跳过](#隐藏项跳过)
  - [用户反馈](#用户反馈)
- [重新同步（导入镜像）](#重新同步导入镜像)
  - [触发方式](#触发方式)
  - [同步语义](#同步语义)
  - [覆盖确认](#覆盖确认)
  - [映射表](#映射表)
- [实现说明](#实现说明)
  - [涉及文件](#涉及文件)
  - [关键函数](#关键函数)
  - [权限](#权限)
  - [数据流](#数据流)
- [已知限制](#已知限制)
- [构建与验证](#构建与验证)
  - [回归测试](#回归测试)
- [版本与迭代记录](#版本与迭代记录)

---

## 功能定位

Tydora 原有的两条「把内容弄进仓库」的路径：

| 方式 | 行为 | 适用场景 |
|------|------|---------|
| 仓库管理 → 打开本地仓库 | 把**整个已存在的文件夹**登记为仓库，**原地读写、不复制** | 你的笔记本来就整整齐齐在一个目录里 |
| 新建文件 / 新建文件夹 | 在仓库内**从零**创建空白文件 | 新写一篇笔记 |

缺少的是中间那条：**手上散着若干 `.md` 文件（或一整个别人的笔记目录），想收进现有仓库**。导入功能补上这一环，重新同步功能解决导入之后的**持续跟进**问题：

| 方式 | 行为 | 适用场景 |
|------|------|---------|
| **导入 Markdown 文档** | 多选文件 → **复制**进仓库指定目录 | 零散的 md 文件、从别处导出的几篇文档 |
| **导入文件夹** | 选一个文件夹 → **递归复制**其中所有 md 与图片，保留子目录结构 | 导入他人的 Obsidian 仓库、批量归档的历史笔记 |
| **重新同步** | 按登记好的映射，把源目录的**新增 / 变更**单向拉进仓库 | 源目录还在被别处维护、需要定期同步 |

> ⚠️ 导入是**一次性快照**：复制完两边就再无关联。想要「源目录改了这边也跟着变」，必须靠**重新同步**——它读取导入时登记的映射表，而不是重新猜路径。

---

## 交互入口

导入的三个入口都是**当前选中文件所在目录**为落点，右侧菜单分组在「新建文件 / 新建白板 / 新建文件夹」之后。

| 入口 | 落点目录 | 备注 |
|------|---------|------|
| 文件树左上工具栏 📄↓ | 当前选中文件所在目录 | 无选中时回落到仓库根 |
| 文件树左上工具栏 🗂↓ | 同上 | |
| 右键**文件** | 该文件所在目录 | |
| 右键**文件夹** | 该文件夹内 | |
| 右键**空白处** | 当前选中文件所在目录 | 无选中时回落到仓库根 |

> 「无选中」= 没有打开任何文件，或当前打开的文件不属于本仓库。

重新同步只有一个入口：

| 入口 | 位置 | 备注 |
|------|------|------|
| 文件树左上工具栏 🔄 | 导入文件夹按钮之后 | 打开「导入镜像与重新同步」弹框，列出当前仓库的全部导入记录 |

---

## 行为规则

### 复制而非移动

两种模式都是 `copyFile` 语义：源文件**原封不动保留在原来的位置**，仓库里得到的是副本。文件字节逐字节复制，不做任何编码转换——GBK 编码的历史笔记不会在导入时被破坏。

### 文件模式

- 系统文件选择器可**多选**，过滤器限定 `md` / `markdown` / `mdx`
- 所有选中文件**平铺**复制进落点目录，原文件在磁盘上的目录层级不保留
- 无扩展名的情况不会发生（过滤器已限定扩展名），仍保留补 `.md` 的兜底
- **每个文件登记一条 `kind: "file"` 镜像记录**（源 = 该文件绝对路径）

### 文件夹模式

- 选择器只允许选**目录**，且只能选一个
- 递归收集该目录下**所有 Markdown 文件与图片**，**跳过以 `.` 开头的隐藏目录与文件**（`.git`、`.obsidian`、`.DS_Store` 等不会被扫进来）
- 图片扩展名与侧栏索引扫描（`services/vault-file-scanner.ts` 的 `IMAGE_EXTENSIONS`）共用一份判定 `isScanImageFile()`，避免两处列表漂移
- 内容落在 `落点目录/<所选文件夹名>/` 下，**完整保留所选目录内部的子目录结构**
- **整次导入只登记一条 `kind: "folder"` 镜像记录**（源 = 所选目录），并在记录里带上本次复制到的文件相对路径清单

举例：把 `D:\我的笔记` 导入到仓库根，其中含 `a.md`、`img/cover.png` 与 `sub/b.md`：

```
仓库根/
└── 我的笔记/
    ├── a.md
    ├── img/
    │   └── cover.png
    └── sub/
        └── b.md
```

在落点目录里多包一层同名目录是刻意为之：避免把外部目录的顶层文件直接泼进仓库根，与现有笔记混在一起；导入两次不同文件夹时也不会互相参杂。

### 命名冲突：永不覆盖

- **同名文件**：自动追加序号，`a.md` 已存在则写成 `a 1.md`，再冲突则 `a 2.md`（复用仓库内既有的 `uniqueFilePath` 逻辑）
- **同名目录**（文件夹模式下 `落点/<所选文件夹名>` 已存在）：**合并进去**，按文件粒度逐个去重，不做整目录改名

导入阶段任何情况下都不会覆盖仓库里已有的文件。（覆盖只发生在**重新同步**阶段，且必须先确认，见下节。）

### 隐藏项跳过

文件夹模式跳过 `.` 开头的目录和文件，与侧栏索引扫描（`services/vault-file-scanner.ts`）的口径一致，避免把版本控制与编辑器元数据当作笔记导进来。

镜像映射表 `.tydora-imports.json` 本身也是 `.` 开头的隐藏文件，因此不会被文件树与索引扫到。

### 用户反馈

| 情况 | 反馈 |
|------|------|
| 导入 N 个文件 | 轻提示「已导入 N 个文档」，随后刷新文件树并展开到落点目录 |
| 选定位置一个可导入文件都没有 | 轻提示「所选位置未找到可导入的 Markdown 文档或图片」，不刷新文件树 |
| 在系统选择器里点取消 | 静默，无任何提示与副作用 |
| 复制失败（权限、磁盘满等） | 控制台记录错误 + 轻提示「导入文档失败」 |

> 注意：导入 N 个文件时中途某个文件失败，总体会走失败分支，之前已复制的文件**不回滚**（保留在仓库里，重名序号也已占用）。
>
> 镜像记录写入失败（例如仓库只读）**不会**把导入报成失败——文件已经复制成功，只在控制台告警，此时该批次失去重新同步能力。

---

## 重新同步（导入镜像）

### 触发方式

工具栏 🔄 → 「导入镜像与重新同步」弹框。弹框列出当前仓库登记过的每一条记录：

```
[文件夹] 我的笔记                      上次同步 2026/9/14 10:20
E:\notes\我的笔记                                     [同步] [移除]

[文件]   笔记本.md                     尚未同步
D:\downloads\笔记本.md                               [同步] [移除]
```

- **同步**：先做一次「只读检查」（`planImportSync`），再按结果决定是否需要确认，最后复制
- **移除**：只删掉这条记录，**不删除**仓库里已导入的文件
- 同步完成后行内显示结果：`新增 2 · 更新 1 · 覆盖 0 · 未变 8 · 源中已删除 1 个（目标保留未删）`

### 同步语义

**单向、源优先**。逐文件比较源与目标的修改时间：

| 情况 | 行为 |
|------|------|
| 源有、目标没有 | 复制（新增） |
| 源 mtime **新于**目标 | 覆盖（更新） |
| 目标 mtime **新于**源（仓库内被改过） | **需要确认**后再覆盖（冲突） |
| 两侧 mtime 相同 | 跳过（未变） |
| 目标有、源已删除 | **不删目标**，只在结果里报告数量 |
| 源目录/文件整个不存在 | 提示「源目录或文件已不存在，未执行同步」，不做任何事 |

为什么比较 mtime 是可靠的：Windows 的文件复制（`std::fs::copy` → `CopyFileExW`）会**保留源文件的修改时间**，所以一次覆盖之后两侧 mtime 相等，下一次同步自然判定为「未变」，不会反复覆盖。（本地实测已验证该行为。）

### 覆盖确认

只要计划里存在「目标更新」的文件，弹框会先切换到确认视图：

```
以下文件在仓库内更新，将被源目录覆盖
同步以源目录为准，覆盖后这些文件在仓库内的修改会丢失。
本次将新增 2 个、更新 1 个，并覆盖上述 3 个文件。

sub/b.md
img/cover.png
...

                                        [取消] [覆盖并同步]
```

取消则整条记录本次不做任何写入。确认后按「新增 → 更新 → 覆盖」的顺序复制。

### 映射表

`.tydora-imports.json`（仓库根，隐藏文件）：

```json
{
  "version": 1,
  "imports": [
    {
      "source": "E:/notes/我的笔记",
      "dest": "我的笔记",
      "kind": "folder",
      "lastSyncAt": "2026-09-14T02:20:11.000Z",
      "files": ["a.md", "img/cover.png", "sub/b.md"]
    },
    { "source": "D:/downloads/笔记本.md", "dest": "笔记本.md", "kind": "file", "lastSyncAt": "2026-09-14T02:20:11.000Z" }
  ]
}
```

- `dest` 是**仓库内相对路径**（`/` 分隔），跨平台可移植
- 「源 + 落点」相同视为同一条记录，重复导入同一位置会覆盖旧记录而不是追加
- `files` 仅 `kind: "folder"` 使用，是上次同步时源内文件的相对路径清单——用于精确报告「源已删除 N 个」
- 手工删除该文件只会失去同步能力，**不影响**已导入的任何文件

---

## 实现说明

### 涉及文件

导入功能（0.2.6）：

| 文件 | 改动 |
|------|------|
| `app/tydora-web/src/Sidebar.tsx` | 4 个模块级辅助函数 + 4 个 handler + 2 个工具栏按钮 + 3 处右键菜单各 2 项 |
| `app/tydora-desktop/capabilities/default.json` | 新增 `fs:allow-copy-file` 权限（scope `**`） |
| `app/tydora-web/src/i18n/locales/zh-CN.json` | 9 个文案键 |
| `app/tydora-web/src/i18n/locales/en-US.json` | 9 个文案键 |

导入镜像 / 重新同步（0.2.7）：

| 文件 | 改动 |
|------|------|
| `app/tydora-web/src/services/importMirror.ts` | **新增**：映射表读写 + `planImportSync` / `applyImportSync` + 仓库相对路径工具 |
| `app/tydora-web/src/components/ImportSyncDialog.tsx` | **新增**：记录列表、逐条同步、覆盖确认视图、移除 |
| `app/tydora-web/src/components/ImportSyncDialog.css` | **新增**：弹框样式（复用 `--bg-*` / `--text-*` / `--accent` 主题变量） |
| `app/tydora-web/src/components/index.ts` | 导出 `ImportSyncDialog` |
| `app/tydora-web/src/Sidebar.tsx` | 导入函数改为返回「数量 + 记录」并登记映射；文件夹模式纳入图片；工具栏新增 🔄 按钮与弹框渲染 |
| `app/tydora-web/src/services/vault-file-scanner.ts` | 导出 `isScanImageFile()`（图片判定单一来源） |
| `app/tydora-web/src/services/useVaultWatcher.ts` | `.tydora-imports.json` 加入噪声段，避免写映射表触发文件树刷新 |
| `app/tydora-web/src/i18n/locales/zh-CN.json` | `sidebar.sync.*` 25 个键 + `toolbar.resync`，并更新 `import.noneFound` 等 3 条旧文案 |
| `app/tydora-web/src/i18n/locales/en-US.json` | 同上 |

导入镜像的回归测试：

| 文件 | 改动 |
|------|------|
| `tests/import-mirror/case.ts` | **新增**：4 个用例 / 59 项断言，跑的是仓库里真实的 `importMirror.ts` |
| `tests/import-mirror/run.mjs` | **新增**：esbuild 打包 + Tauri IPC 替身 + 运行器 |
| `package.json` | 新增 `test` 脚本 |

**本次没有新增任何 fs 权限**：mtime 与目录枚举走应用自身的 `list_dir_with_meta` 命令（`app/tydora-desktop/src/commands/file_commands.rs`，`std::fs` 直读，不受 ACL scope 限制），复制/建目录/读写文本沿用既有权限。

### 关键函数

导入相关（`app/tydora-web/src/Sidebar.tsx`）：

| 函数 | 职责 |
|------|------|
| `copyMarkdownFilesInto(targetDir, vaultPath)` | 弹出多选文件选择器 → 逐个复制进 `targetDir`，并为每个文件生成一条 `kind: "file"` 记录。返回 `{ count, records }`；用户取消返回 `null` |
| `collectImportTree(rootDir)` | 递归遍历目录，返回 `{ rel, path }[]`（`rel` 以 `/` 分隔，供重建目录结构用）；收集范围 = Markdown + 图片；读不动的子目录跳过而不中断整体 |
| `copyMarkdownFolderInto(targetDir, vaultPath)` | 弹出目录选择器 → 建 `targetDir/<folderName>` → 按 `collectImportTree` 结果重建子目录并复制，生成一条 `kind: "folder"` 记录。返回 `{ count, records }`；取消返回 `null` |
| `reportImport(run, vaultPath)` | 统一处理提示、登记映射与异常：`null` 静默、`count === 0` 提示未找到、`>0` 提示数量并返回 `true`（调用方据此决定是否刷新文件树） |
| `isImportableFile(name)` | 导入收集范围的唯一判定：`isMarkdownFileName(name) \|\| isScanImageFile(name)` |
| `isInsideVaultRel(rel)` | 校验 `toVaultRelative` 的结果确实在仓库内（仓外路径会被原样返回，此时不登记记录） |

镜像相关（`app/tydora-web/src/services/importMirror.ts`）：

| 函数 | 职责 |
|------|------|
| `loadImportMapping(vaultPath)` | 读取 `.tydora-imports.json`；不存在 / 损坏 / 非法条目一律当作空表，不抛错 |
| `addImportRecords(vaultPath, records)` | 按「源 + 落点」去重写入记录 |
| `removeImportRecord(vaultPath, record)` | 移除一条记录（不动文件） |
| `planImportSync(vaultPath, record)` | **只读检查**：返回 `toAdd` / `toUpdate` / `conflicts` / `unchanged` / `removed` / `sourceRels` / `sourceMissing` |
| `applyImportSync(vaultPath, record, plan)` | 按计划复制、原地更新记录的 `lastSyncAt` 与 `files`、落盘映射表，返回各桶计数（单文件失败计入 `failed` 而不中断） |
| `toVaultRelative` / `fromVaultRelative` | 绝对路径 ↔ 仓库内相对路径（`/` 分隔，跨平台） |

复用仓库内已有工具：`uniqueFilePath`（去重命名）、`joinPath` / `pathSep` / `parentPath` / `ancestorDirs`（跨平台路径）、`isMarkdownFileName`（扩展名判定）、`showToast`（轻提示）、`AppModal`（弹框外壳）、`list_dir_with_meta`（带 mtime 的目录枚举）。

### 权限

导入功能需要 `fs:allow-copy-file`（`app/tydora-desktop/capabilities/default.json`）。原有 `fs` 权限覆盖了读文本、写文本、读目录、建目录、删除、重命名、`exists`，但**没有复制**；不加这条，前端调用 `plugin-fs` 的 `copyFile` 会被 ACL 直接拒绝。

```json
{
  "identifier": "fs:allow-copy-file",
  "allow": [{ "path": "**" }]
}
```

重新同步**未新增权限**，因此本次改动只涉及前端资源。

> ⚠️ capabilities 由 `tauri-build` 编译进二进制（落到 `app/tydora-desktop/gen/schemas/capabilities.json`），**改完必须重新构建才生效**，且会触发 `tydora-desktop` crate 整体重新编译（约 2 分钟）。

### 数据流

导入：

```
点击入口
  ↓
open() 系统选择器（plugin-dialog）
  ↓  选中的绝对路径
collectImportTree / 逐个解析文件名
  ↓  逐个文件
exists + uniqueFilePath  →  目标绝对路径（重名加序号）
  ↓
copyFile(源, 目标)（plugin-fs，走 fs:allow-copy-file）
  ↓
toVaultRelative 算出落点相对路径 → addImportRecords 写 .tydora-imports.json
  ↓
reportImport 提示数量
  ↓
onReload / handleReload 刷新文件树
  ↓
仓库文件监听（watcher）另行触发链接索引 / 标签索引重建，无需额外处理
```

重新同步：

```
工具栏 🔄 → ImportSyncDialog 打开 → loadImportMapping
  ↓  用户点某条记录的「同步」
planImportSync（只读：要源树的 mtime，也要目标树的 mtime）
  ↓  conflicts 非空？
  ├─ 是 → 覆盖确认视图 → 用户确认
  └─ 否 → 直接继续
  ↓
applyImportSync：mkdir -p → copyFile（逐文件）→ 更新记录 → 落盘映射表
  ↓
onSynced(dest) → handleReload(ancestorDirs(dest)) 展开落点并刷新文件树
  ↓
写盘触发的 watcher 事件会重建索引；映射表本身在噪声段内，不触发文件树刷新
```

---

## 已知限制

1. **同步是手动的**（本次范围只做第一步）：没有后台定时同步，也没有「源目录变化自动推」——多 watch root 需要 Rust 侧 `watch_paths` 支持，留待下一步。
2. **不做双向合并**：以源为准。仓库内对镜像文件的修改会在下次同步时被覆盖（会先列出清单要求确认）。
3. **源删除不删目标**：源里删掉的文件，仓库里保留，只在结果里报告数量。要清理由用户手动删。
4. **不查重**：文件夹模式重复导入同一个目录会产生第二份（文件名加序号），不做内容比对去重。这样设计是为了避免把「不同目录下的同名但内容不同的文件」误判为重复而丢弃。
5. **只镜像 Markdown + 图片**：`.pdf` / `.canvas` 等其他附件不参与导入与同步；被导入笔记里的 `![[x.pdf]]` 不会被一起搬过来（`![[image.png]]` 会）。
6. **合并进已存在的同名目录时映射会有偏差**：那种情况下导入会按 `uniqueFilePath` 加序号落地（如 `a 1.md`），而映射记录按源相对路径（`a.md`）；下一次同步会把 `a.md` 复制到正名位置，于是同一内容在仓库里出现两份。要避免就先导入到空目录。
7. **不解析 WikiLink**：导入与同步都不做链接重写，`[[笔记名]]` 是否连得上取决于目标仓库里是否已有同名文件。
8. **失败不回滚**：见「用户反馈」末尾说明。
9. **无进度条**：大批量文件夹导入/同步是静默进行的，只有结束时的一次轻提示；数千文件时界面可能短暂无响应。
10. **不做同名目录改名**：文件夹模式合并进已存在的同名目录，而不是建 `我的笔记 1`。
11. **映射表可被手工破坏**：删除或改坏 `.tydora-imports.json` 只会失去同步能力，已导入文件不受影响；损坏条目在读取时被静默丢弃。

---

## 构建与验证

```bash
# 仓库根执行；老 shell 需先 export RUSTUP_HOME / CARGO_HOME 或换新终端
npm run tauri build -- --no-bundle
```

产物：`target/release/tydora-desktop.exe`（仓库根 target，非 `app/target`），约 15 MB 单文件自包含。

**验证前提**：如果本机装有官方安装版 Tydora，它的 identifier 同为 `com.tydora.editor`，`tauri-plugin-single-instance` 会拦住第二个实例并把参数转发过去——**测试绿色版前必须先完全退出安装版**，否则看到的是旧界面。

已完成的验证范围：

| 项目 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npx vite build` | exit 0 |
| `npm run tauri build -- --no-bundle` | exit 0，产物 `target/release/tydora-desktop.exe` |
| `npm test`（导入镜像回归测试） | 4 通过 / 0 失败，59 项断言 |
| `fs:allow-copy-file` 落到 `gen/schemas/capabilities.json` | 通过 |
| Windows 复制保留源 mtime（PowerShell `Copy-Item` 实测） | 通过，是「覆盖后不再反复覆盖」的前提 |

**未做**：交互式 GUI 点击验收（原生目录选择器是瞬时窗口、不可被自动化工具定位；且本机若装有官方安装版会占用单实例锁）。因此「点 🔄 → 选记录 → 确认覆盖 → 文件树展开到落点」这一串**交互编排**只有代码路径与类型检查佐证；**同步的判定与文件效果**则由下面的回归测试覆盖。

### 回归测试

```bash
npm test
```

用例在 `tests/import-mirror/case.ts`，跑的是**仓库里真实的** `app/tydora-web/src/services/importMirror.ts`——不是另写一份等价逻辑。运行器 `tests/import-mirror/run.mjs` 用 esbuild（vite 自带，**未新增任何依赖**）把源码打成一个 Node 可执行的 bundle，构建时只把 Tauri 的 IPC 边界换成 `node:fs` 替身：

| 真实依赖 | 替身 |
|---------|------|
| `@tauri-apps/api/core` 的 `invoke("list_dir_with_meta")` | `fs.readdirSync(..., {withFileTypes:true})` + `statSync`，mtime 按 Rust 侧 `as_millis()` 截断为整数毫秒 |
| `@tauri-apps/plugin-fs`（`copyFile` / `exists` / `mkdir` / `readTextFile` / `writeTextFile` / `readDir`） | 同名 `node:fs` 封装 |
| `@tauri-apps/plugin-dialog`、`api/event`、`api/window`、`../i18n` | 空实现 / 直通 |

覆盖范围（对齐「同步语义」一节的每一条约定）：

| 用例 | 断言内容 |
|------|---------|
| 目录镜像生命周期 | 登记映射 → 首次同步全部「未变」→ 源更新（覆盖）→ 幂等（二次同步无事可做）→ 源新增子目录文件 → 目标更新进 `conflicts` 且需确认才覆盖 → **源删除只报告、目标文件保留** → 源整棵消失 `sourceMissing` 且目标一个文件不动 → 图片字节同步 |
| 单文件 `kind=file` | 新增 / 幂等 / 源消失后副本保留 |
| 映射表 | 空记录不写盘、同「源 + 落点」去重覆盖、移除只删一条、坏 JSON 退化为空表、缺 `kind` 的条目被过滤 |
| 路径换算 | `toVaultRelative` / `fromVaultRelative` 正反斜杠归一、仓库根 → 空串、仓外路径原样返回、`C:\vaultish` 不被误判为仓库内、往返一致 |

沙盒固定在仓库内被 gitignore 的 `.build/test-import-mirror/`，全程只碰这个目录，不读不写任何真实仓库；**全部通过时自动清理**，失败时保留供排查。

> 测试放在顶层 `tests/` 而非 `app/tydora-web/src/` 下，是因为 `tsconfig.json` 的 `include` 只有 `app/tydora-web/src`，且未装 `@types/node`——放进 `src/` 会让 `npm run build` 的 `tsc` 阶段失败。

---

## 版本与迭代记录

### 本次迭代：v0.2.7 本地功能（导入镜像 / 重新同步）

版本号**直接跟随上游裸版本**（`VERSION` 文件 + `scripts/sync-version.mjs`），当前为 `v0.2.7`——不做本地迭代后缀。功能改动**全部在前端**（新增 3 个文件、修改 5 个文件），未动 `capabilities`，因此没有触发 crate 整体重编译；随后又补了本文提到的回归测试（新增 2 个文件 + `package.json` 1 行）。

| 类型 | 内容 |
|------|------|
| 🚀 新功能 | 「导入镜像」：导入时登记「源 → 仓库内位置」映射（`.tydora-imports.json`） |
| 🚀 新功能 | 「重新同步」：逐文件 mtime 比较，单向拉取源目录的新增 / 变更 |
| 🚀 新功能 | 覆盖确认：目标更新的文件先列清单，确认后才覆盖 |
| 🚀 新功能 | 源删除的文件不删目标，仅报告数量 |
| 🔧 改进 | 文件夹模式从「只认 Markdown」扩展为 **Markdown + 图片**，图片判定复用索引扫描的扩展名表 |
| 🔧 改进 | 映射表路径加入 watcher 噪声段，避免写记录触发文件树刷新 |
| ✅ 测试 | `npm test`：59 项断言的回归用例，跑真实 `importMirror.ts`（Tauri IPC 用 `node:fs` 替身） |
| 📝 文档 | 本文档扩写为新功能说明 |

### 上一次迭代：0.2.5 → 0.2.6（导入功能）

版本号走仓库既有单源流程（`VERSION` 文件 + `scripts/sync-version.mjs`）。

| 类型 | 内容 |
|------|------|
| 🚀 新功能 | 「导入 Markdown 文档」——多选 md 文件复制进当前仓库 |
| 🚀 新功能 | 「导入文件夹」——递归复制整个目录树的 md，保留子目录结构 |
| 🔧 构建 | 新增 `fs:allow-copy-file` 权限 |
| 📝 文档 | 新增本文档 |

> 按本仓库 [发布流程](./release-process.md#版本决策规则) 的规则，`feat` 类变更对应 MINOR bump。当时取 0.2.6 是为了与上游已发布的 v0.2.6 **同号段对齐**——本仓库是 `zuorn/Tydora` 的本地分支，改动未回上游，版本号不参与上游的 release-please 决策。

### 与上游的关系

| 项 | 状态 |
|----|------|
| 上游仓库 | `github.com/zuorn/Tydora` |
| 上游最新发布 | v0.2.7 |
| 本分支基线 | 上游 v0.2.7 + 未回上游的本地改动（窗口图标修复、logo 替换、导入功能、导入镜像 / 重新同步） |

本地改动若要回上游，需走 Conventional Commits 提交（例如 `feat(sidebar): 支持导入 Markdown 文档与文件夹`、`feat(sidebar): 导入镜像与手动重新同步`），由上游的 release-please 重新决策版本号。
