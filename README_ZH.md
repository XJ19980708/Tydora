[![GitHub Stars](https://img.shields.io/github/stars/zuorn/Tydora?style=flat-square)](https://github.com/zuorn/Tydora)
[![Release](https://img.shields.io/github/v/release/XJ19980708/Tydora?style=flat-square)](https://github.com/XJ19980708/Tydora/releases)
[![License](<https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square>)](LICENSE)
[![Platform](<https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square>)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev/)

[English](README.md) | 简体中文

> **这是 [zuorn/Tydora](https://github.com/zuorn/Tydora) 的个人 fork 版**（Apache-2.0），基于上游 **v0.3.1** 构建，增加了若干本地功能，并提供免安装的便携版。
> 📦 **便携版下载**：[Releases](https://github.com/XJ19980708/Tydora/releases) 里的 `Tydora-0.3.1-portable-win-x64.zip`，解压后双击 `tydora-desktop.exe`（Windows x64）。首次启动有几个注意事项，见[快速开始](#快速开始)。

![image.png](/website/assets/image-20260910-223544.png)

---

我曾长久地在 **Typora** 里安放专注，在 **Obsidian** 的图谱前整理思绪。但心底始终觉得，还缺少些什么——
少一些指尖触及思想时的<mark>绝对顺滑</mark>，少一些让知识直接铺展成画布的<mark>自由</mark>。

于是，我决定自己写一个。它的名字叫 **Tydora**。

这是我用无数个安静的深夜独自打磨出的 **Markdown 编辑器**，有平替 **Typora** 的底气，也有叫板 **Obsidian** 的野心。它不只是工具，更像是一张递给<mark>同路人的书桌</mark>——**干净、安静，却暗藏山河**。

---

## **✒️书写，应如呼吸**

<mark>极致的书写体验</mark>，所见即所得，界面<mark>纯净</mark>到只剩文字本身。没有一丝多余的**干扰**，光标所至，**思绪**便直接落在屏幕上。我把自己对“<mark>写作手感</mark>”的所有**执念**都写了进去，让工具彻底**隐退**，只留你与<mark>思想的河流</mark>。

![image.png](website/assets/image-20260815-171029.png)

---

## **🪐知识不是孤岛，是星座**

笔记之间生成**关系图谱**，那是<mark>思想的引力线</mark>。而**无限白板画布**，则允许你亲手牵引这些<mark>星辰</mark>，<mark>自由连线</mark>、<mark>重组逻辑</mark>。比图谱更进一步 —— 在这里，<mark>你的认知可以不设边界</mark>。

![image.png](website/assets/image-20260815-171200.png)

---

## **🌳从线到树，一步见林**

一键将文档转为**思维导图**。线性文字倏然展开成枝干分明的**结构**，层级、脉络一览无余。写大纲、拆书、复盘思考，无需切换任何工具，<mark>心流</mark>始终不断。你看见的，即是<mark>思维本身的形状</mark>**。**

![image.png](website/assets/image-20260815-171446.png)

---

## **🌸让知识花园，静默盛放于网络**

**本地知识仓库，一键发布为静态网页**。博客、文档库、个人 Wiki。分享知识这件事，终于变得<mark>干净而体面</mark>。

![image.png](website/assets/image-20260815-172124.png)

---

## **📚一张书桌，静候同路人**

它是我交出的答案，也是递给同路人的一份邀请。
如果你也在寻找更懂你的<mark>书写伴侣</mark>，不妨来 **Tydora** 坐坐。

🔗 [https://zuorn.github.io/Tydora](https://zuorn.github.io/Tydora)

有任何想让它做到的事，请告诉我——我继续打磨，直到它成为我们<mark>心中理想的样子</mark>。

---

## 本 Fork 的改动

[zuorn/Tydora](https://github.com/zuorn/Tydora) 的个人 fork，跟随上游发布（当前 **v0.3.1**）。改动分两类：

**本 fork 新增**

- **打开文件（不导入）** —— `Ctrl+Alt+O`、欢迎页按钮或命令面板打开任意 Markdown 文件，**直接编辑原文件**而不是复制副本；多选时每个文件各开一个新窗口。不属于任何仓库的文件会进「最近打开」列表，并自动展开大纲栏。
- **导入 Markdown 文档 / 整个文件夹** —— 在文件树右键菜单里把散落的 `.md`（连同图片）复制进仓库，保留目录结构。
- **导入镜像 + 手动重新同步** —— 导入过的文件登记映射，之后可对照源重新同步：源更新则覆盖，源删除只报告、**不删仓库里的文件**。
- **版本更新说明** —— 「关于 → 版本更新说明」逐版本列出改动（由本地 git 历史离线生成）。
- 自定义应用 logo；修复 Windows 任务管理器里窗口图标显示为乱码花纹的问题。

**随上游获得（v0.2.8 … v0.3.1）**

- 仓外文件临时仓库、界面缩放（75%–150%）、导出/PDF 页面背景色、侧栏复制相对/绝对路径、`[TOC]` 生成、文件树文件类型图标、首次启动欢迎仓库、编辑器安全命令执行。

## 快速开始

### 便携版（推荐）

1. 从本仓库 [Releases](https://github.com/XJ19980708/Tydora/releases) 下载 `Tydora-0.3.1-portable-win-x64.zip`。
2. 解压到任意位置（两个 `.exe` 保持同目录），双击 `tydora-desktop.exe`。

首次启动前的几个注意事项：

- **SmartScreen 拦截** —— 若 Windows 提示「已保护你的电脑」，点「更多信息」→「仍要运行」。这是未做代码签名所致，不是文件有问题。
- **需要 WebView2 运行时** —— Windows 11 自带；Windows 10 一般随 Microsoft Edge 已装好。
- **如果装过官方版 Tydora** —— 请先完全退出（含系统托盘图标）。两者共用同一个单实例标识，否则双击便携版只会唤起已安装的那个。
- 设置、主题等存放在 `%APPDATA%\com.tydora.editor` —— 它是免安装而非全便携，换电脑时把这个目录一起带走即可。

### 官方安装包

上游官方安装包（会注册 `.md` 文件关联）见 [zuorn/Tydora Releases](https://github.com/zuorn/Tydora/releases)。

## **从源码运行**

```bash
git clone https://github.com/XJ19980708/Tydora.git
cd Tydora
npm install

npm run tauri dev
npm run tauri build -- --no-bundle   # 便携 exe → target/release/tydora-desktop.exe
```

## 技术栈


| 层级   | 技术                                                        |
| -------- | ------------------------------------------------------------- |
| 前端   | React 19 + TypeScript + Vite 6                              |
| 编辑器 | TipTap 3.x (WYSIWYG) + CodeMirror 6 (源码)                  |
| 后端   | Rust (Tauri v2)                                             |
| 可视化 | D3.js (图谱) + markmap (思维导图) + React Flow (画布)       |
| 插件   | tauri-plugin-fs / dialog / window-state / updater / process |

## 贡献

欢迎提交 Issue 和 Pull Request！

## Contributors

[![](https://contrib.rocks/image?repo=zuorn/Tydora)](https://github.com/zuorn/Tydora/graphs/contributors)

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=zuorn/Tydora&type=date&legend=top-left&sealed_token=UbjlpYMAKlj9YxE9TrI3oZEpbMArNY0oRBtXdZ4GlQe9lQG0bgKmhoGnECO6aR-BCg34sIpFHJLyux4trfCJQVTOG2DIOa2HKERx9cCUMNhsoboxUFNz8g)](https://www.star-history.com/?repos=zuorn%2FTydora&type=date&legend=top-left)

## 许可证

本项目使用 [Apache License 2.0](LICENSE) 许可证。

本仓库 fork 自 [zuorn/Tydora](https://github.com/zuorn/Tydora)，原项目及其贡献者享有原始著作权。本 fork 的新增部分（自定义 logo、直接打开源文件、导入镜像、版本更新说明）同样以 Apache-2.0 许可证发布。
