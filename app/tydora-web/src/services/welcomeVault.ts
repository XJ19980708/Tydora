/**
 * 介绍仓库（welcome-vault）共享逻辑。
 *
 * Rust `ensure_welcome_vault` 命令会把内置欢迎文档物化到
 * app_data_dir/welcome-vault：中文版（欢迎.md / 快捷键.md）与
 * 英文版（Welcome.md / Shortcuts.md）同时存在，前端按当前界面语言
 * 只显示对应语言的文档。
 */

/** 介绍仓库的物理目录名 */
export const WELCOME_VAULT_DIR_NAME = "welcome-vault";

/** localStorage 键：ensure_welcome_vault 返回的介绍仓库真实绝对路径 */
const WELCOME_VAULT_DIR_KEY = "zmd-welcome-vault-dir";

/** 各界面语言下应显示的文档文件名（其余语言的文档隐藏） */
const WELCOME_VAULT_DOCS_BY_LANG: Record<string, string[]> = {
  "zh-CN": ["欢迎.md", "快捷键.md"],
  "en-US": ["Welcome.md", "Shortcuts.md"],
};

/** 读取已记录的介绍仓库绝对路径（未初始化/被清理时返回 null） */
export function getWelcomeVaultDir(): string | null {
  try {
    return localStorage.getItem(WELCOME_VAULT_DIR_KEY) || null;
  } catch {
    return null;
  }
}

/** 记录介绍仓库的绝对路径（ensure_welcome_vault 成功后调用） */
export function setWelcomeVaultDir(dir: string): void {
  try {
    localStorage.setItem(WELCOME_VAULT_DIR_KEY, dir);
  } catch {
    /* ignore */
  }
}

function normalizeForCompare(p: string): string {
  return p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
}

/**
 * 判断某路径是否为介绍仓库。
 * 优先与 Rust 物化时记录的真实绝对路径精确比对（避免用户自建的、
 * 恰好同名的 welcome-vault 文件夹被误判）；记录缺失时退回目录名匹配。
 */
export function isWelcomeVaultPath(p: string | null | undefined): boolean {
  if (!p) return false;
  const norm = normalizeForCompare(p);
  const stored = getWelcomeVaultDir();
  if (stored) {
    return normalizeForCompare(stored) === norm;
  }
  const segs = p.split(/[\\/]/).filter(Boolean);
  return segs.length > 0 && segs[segs.length - 1].toLowerCase() === WELCOME_VAULT_DIR_NAME;
}

/** 当前语言下介绍仓库应显示的文档文件名（未知语言回退英文） */
export function welcomeVaultVisibleDocs(language: string): string[] {
  return WELCOME_VAULT_DOCS_BY_LANG[language] ?? WELCOME_VAULT_DOCS_BY_LANG["en-US"];
}
