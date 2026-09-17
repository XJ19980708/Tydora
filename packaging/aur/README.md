# Tydora on Arch Linux (AUR)

两个包的源码就在本目录，各自对应一个 AUR 仓库（同名）：

| 目录 | AUR 包名 | 说明 |
| --- | --- | --- |
| `tydora/` | `tydora` | **源码构建**。npm 拉前端依赖 + cargo 编译，产物在本机生成。首次构建约 15–30 分钟（其中 `npm ci` 与 Rust LTO 编译是主要耗时），装完占用约 60 MB。 |
| `tydora-bin/` | `tydora-bin` | **官方预编译产物重打包**。直接拆上游 GitHub Release 的 `.deb` 重装，秒级安装，体积约 21 MB。不想等编译就用它。 |

两个包**安装后的文件布局完全一致**，可以随时互换（`tydora-bin` 声明了 `provides=tydora`，`conflicts` 互相排斥）。

---

## 1. 用户安装

```bash
# AUR 助手（推荐）
yay  -S tydora        # 源码构建
yay  -S tydora-bin    # 预编译

paru -S tydora        # 同理

# 或者纯 makepkg
git clone https://aur.archlinux.org/tydora-bin.git
cd tydora-bin && makepkg -si
```

## 2. 安装后得到什么

```
/usr/bin/tydora                                    主程序（GUI 也走这个命令启动）
/usr/bin/tydora-cli                                命令行 / MCP 工具（Tauri sidecar）
/usr/share/applications/tydora.desktop              桌面入口（含 .md 的 MimeType）
/usr/share/icons/hicolor/32x32/apps/tydora.png
                        /64x64/apps/tydora.png
                        /128x128/apps/tydora.png
                        /256x256/apps/tydora.png     （来自上游 128x128@2x.png）
                        /512x512/apps/tydora.png     （来自上游 icon.png）
```

几个容易踩的点，本包都按下面的方式处理：

- **`tydora-cli` 必须和 `tydora` 同目录。** 桌面端「设置 → CLI 与 MCP」是用
  `current_exe().parent()/tydora-cli` 探测的（`app/tydora-desktop/src/lib.rs`
  的 `cli_sidecar_info`），所以两个二进制都装在 `/usr/bin`，不能把 CLI 丢进
  `/usr/lib/tydora/`。
- **可执行文件名必须是 `tydora`。** `tauri.conf.json` 没开
  `app.enable_gtk_app_id`，GTK 会拿 `argv[0]` 当 `WM_CLASS`，而 `.desktop` 里的
  `StartupWMClass` 也只有和它一致，GNOME / KDE 才不会出现「一个图标 + 一个孤立窗口」。
- **`.desktop` 是自己写的，不是复用上游的。** 上游 `.deb` 里那份是
  `tauri-bundler` 生成的，`Categories=` 为空（`desktop-file-validate` 直接报错），
  而且完全没有 `MimeType` —— 双击 `.md` 关联不上。
- **`Exec=tydora %F`，不是 `%U`。** 应用按**文件系统路径**过滤启动参数
  （`filter_markdown_paths`），`%U` 传的是 `file://` URI，会被直接忽略。
- **图标目录名修正。** 上游 `.deb` 把 256px 图标塞进了 `hicolor/256x256@2/`
  （不是合法的 hicolor 尺寸目录），本包归位到 `256x256/`。

前端资源（HTML/JS/CSS）和「Tydora 介绍」仓库文档都由 `include_str!` /
`generate_context!` 在编译期内嵌进二进制，所以**不需要任何 `/usr/share/tydora` 资源目录**。

## 3. 运行时依赖

```bash
# depends（装包时自动装）
gtk3  libsoup3  openssl  webkit2gtk-4.1  xdg-utils
#                                        ^^^^^^^^^ 打开外部链接 / 「在文件管理器中显示」
#                                                   全靠它提供的 xdg-open

# optdepends：只在用「发布成静态网站」功能时才需要
sudo pacman -S nodejs
npm install -g @abstractwebunit/markdown-publish
```

## 4. 已知限制

- **应用内自动更新在包安装版上不可用**，请用 `pacman -Syu` / `yay -Syu` 升级。
  上游 `latest.json` 的 `linux-x86_64` 指向 AppImage，而
  `tauri-plugin-updater` 在 Linux 上只支持「原地替换当前可执行文件」
  （`extract_path = current_exe()`），从 `/usr/bin/tydora` 启动时必然 `EACCES`
  失败（而且整个安装包已经白下了一遍）。
  **含「包管理器安装识别」的版本起**，应用会通过查 pacman/dpkg/rpm 的文件归属
  判断自己由包管理器安装：检查更新仍会提示有新版本，但按钮从「下载」变成
  「复制更新命令」，直接给出 `yay -Syu tydora`（官方仓库包则是 `sudo pacman -Syu`），
  不再做注定失败的下载；同时更新失败也会有可见提示，不再只写控制台。
  0.2.9 及更早版本没有这个识别，点更新只会失败且界面无任何反馈。
  （**不能**把 `tauri.conf.json` 的 `updater.endpoints` 改成空数组来关掉它：
  插件的 `Builder::build()` 遇到空列表会返回 `Error::EmptyEndpoints`，应用直接起不来。）
- **源码包的 `npm ci` 会连带装一整套 Angular 工具链。** `package.json` 用
  `file:./vendor/markdown-publish` 挂了 markdown-publish，而它的 `dependencies`
  就是 Angular 全家桶。前端源码并不 import 它（运行时靠 PATH 上的全局
  markdown-publish），但删掉这个依赖会让 `npm ci` 与 `package-lock.json`
  不一致而报错，所以只能照装。
- **`app/Cargo.toml` 的 license 写错了。** `[workspace.package] license = "MIT"`，
  但仓库 `LICENSE` 和两份 README 都声明 Apache-2.0。PKGBUILD 依 `LICENSE` 取
  `license=('Apache')`。建议顺手把 `app/Cargo.toml` 改成 `"Apache-2.0"`。
- **`license=('Apache')` 是 Arch 的「common license」**，license 文件由
  `licenses` 包提供，按打包规范不重复安装 `/usr/share/licenses/` 下的副本。

## 5. 发新版本时怎么更新

`VERSION` 变了以后（`npm run sync-version` 之后），两个 PKGBUILD 要改三处：

```bash
cd packaging/aur

# tydora：pkgver + pkgrel 归 1 + 重算源码包校验和
new=0.2.10
sed -i "s/^pkgver=.*/pkgver=$new/; s/^pkgrel=.*/pkgrel=1/" tydora/PKGBUILD
curl -sSL "https://github.com/zuorn/Tydora/archive/refs/tags/v$new.tar.gz" \
  | sha256sum   # 把结果填进 sha256sums，并同步 .SRCINFO 里的 pkgver/文件名

# tydora-bin：pkgver + 两个 deb 的校验和
sed -i "s/^pkgver=.*/pkgver=$new/; s/^pkgrel=.*/pkgrel=1/" tydora-bin/PKGBUILD
curl -sSL "https://github.com/zuorn/Tydora/releases/download/v$new/03-Tydora_${new}_amd64.deb" | sha256sum
curl -sSL "https://github.com/zuorn/Tydora/releases/download/v$new/03-Tydora_${new}_arm64.deb" | sha256sum

./publish.sh --dry-run    # 看 diff，顺手重新生成 .SRCINFO
bash publish.sh           # 推送
```

`.SRCINFO` 不需要手工维护 —— `publish.sh` 每次都会用
`makepkg --printsrcinfo` 重新生成。目录里手写的那份只是为了不在 Arch 上也能
直接看到元数据（以及方便本地 `makepkg`）。

## 6. 提交前自查（在 Arch 上跑）

```bash
cd packaging/aur/tydora        # 或 tydora-bin

makepkg --printsrcinfo > /dev/null        # PKGBUILD 语法
namcap PKGBUILD                           # 依赖漏了/多了、源地址问题
makepkg -si                               # 真机构建 + 安装
namcap tydora-*.pkg.tar.zst               # 产物检查

# 安装结果验证
pacman -Ql tydora          # 文件清单
which tydora tydora-cli
tydora-cli --version       # 应输出 "tydora 0.2.9"
desktop-file-validate /usr/share/applications/tydora.desktop
gtk-launch tydora          # 或直接在应用菜单里点开
```

## 7. 发布到 AUR

见 `publish.sh` 顶部的注释（账号、SSH key、`~/.ssh/config`），准备好之后：

```bash
bash publish.sh --dry-run    # 先看一遍
bash publish.sh
```

包页面上线后：
- `https://aur.archlinux.org/packages/tydora`
- `https://aur.archlinux.org/packages/tydora-bin`
