#!/usr/bin/env bash
#
# 把 packaging/aur/<pkg> 发布（或更新）到 AUR。
#
# ── 首次使用前的准备（只做一次）─────────────────────────────────────────────
#   1. 在 https://aur.archlinux.org 注册账号（用 Arch 论坛/邮件激活）；
#   2. 生成专用 SSH 密钥（AUR 只认 ssh，不支持 https 写入）：
#        ssh-keygen -t ed25519 -f ~/.ssh/aur -C "你的AUR账号"
#      在 ~/.ssh/config 里指定，避免和其他 github key 抢：
#        Host aur.archlinux.org
#          User aur
#          IdentityFile ~/.ssh/aur
#          IdentitiesOnly yes
#   3. 把 ~/.ssh/aur.pub 的内容粘到 AUR → My Account → SSH Public Key；
#   4. 验证：ssh -T aur@aur.archlinux.org   → "Welcome to AUR, <账号>!"
#
# ── 用法 ────────────────────────────────────────────────────────────────────
#   bash publish.sh                 # tydora + tydora-bin（git 上没带 +x 位就用 bash 调）
#   bash publish.sh tydora          # 只发一个
#   bash publish.sh --dry-run ...   # 只拉下来生成 .SRCINFO、打印 diff，不提交不推送
#
# 说明：脚本一定会用 makepkg --printsrcinfo 重新生成 .SRCINFO。AUR 收到推送后
# 会自己重新生成一份并比对，手工写的（尤其字段顺序）很容易被打回。
#
set -euo pipefail

AUR_HOST="aur.archlinux.org"
AUR_USER="aur"
ALL_PACKAGES=(tydora tydora-bin)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${AUR_WORK_DIR:-$SCRIPT_DIR/.aur-work}"

DRY_RUN=0
PACKAGES=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    -*)
      echo "未知参数：$arg" >&2
      exit 2
      ;;
    *) PACKAGES+=("$arg") ;;
  esac
done
if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  PACKAGES=("${ALL_PACKAGES[@]}")
fi

for tool in git ssh makepkg; do
  command -v "$tool" >/dev/null || { echo "缺少命令：$tool" >&2; exit 1; }
done

# 先探一次权限，失败就给出可操作的提示，而不是让 git 抛一堆 ssh 报错
if [[ $DRY_RUN -eq 0 ]]; then
  echo "[aur] 检查 SSH 权限：$AUR_USER@$AUR_HOST"
  if ! git ls-remote "ssh://$AUR_USER@$AUR_HOST/tydora.git" >/dev/null 2>&1; then
    cat >&2 <<'EOF'
[aur] 无法访问 AUR。请依次确认：
  1) 已在 https://aur.archlinux.org 注册并激活账号；
  2) 公钥已填进 AUR → My Account → SSH Public Key（不是 GitHub 那份也行，但要是同一对）；
  3) ~/.ssh/config 里有：
        Host aur.archlinux.org
          User aur
          IdentityFile ~/.ssh/aur
  4) ssh -T aur@aur.archlinux.org 能打印 "Welcome to AUR, <账号>!"
EOF
    exit 1
  fi
fi

mkdir -p "$WORK_DIR"

url_for() { echo "ssh://$AUR_USER@$AUR_HOST/$1.git"; }

for pkg in "${PACKAGES[@]}"; do
  src_dir="$SCRIPT_DIR/$pkg"
  dst_dir="$WORK_DIR/$pkg"

  [[ -f "$src_dir/PKGBUILD" ]] || { echo "[aur] 找不到 $src_dir/PKGBUILD" >&2; exit 1; }

  echo
  echo "=== $pkg ==="

  if [[ -d "$dst_dir/.git" ]]; then
    git -C "$dst_dir" fetch --quiet origin || true
    # AUR 仓库的默认分支是 master
    if git -C "$dst_dir" rev-parse --verify --quiet origin/master >/dev/null; then
      git -C "$dst_dir" reset --hard --quiet origin/master
    fi
  else
    echo "[aur] clone $(url_for "$pkg")"
    # 包在 AUR 上还不存在时，服务端会返回一个空仓库（带 "empty repository" 警告），
    # 这是预期行为：首次 push 时 AUR 才真正创建这个包。
    if ! git clone --quiet "$(url_for "$pkg")" "$dst_dir" 2>/dev/null; then
      mkdir -p "$dst_dir"
      git -C "$dst_dir" init --quiet --initial-branch=master
      git -C "$dst_dir" remote add origin "$(url_for "$pkg")"
    fi
  fi

  install -m 0644 "$src_dir/PKGBUILD" "$dst_dir/PKGBUILD"
  # .SRCINFO 交给 makepkg 生成，保证与 PKGBUILD 完全一致
  ( cd "$dst_dir" && makepkg --printsrcinfo > .SRCINFO )
  echo "[aur] 已生成 .SRCINFO"
  sed -n '1,6p' "$dst_dir/.SRCINFO"

  pkgver="$(sed -n 's/^pkgver=//p' "$src_dir/PKGBUILD")"
  pkgrel="$(sed -n 's/^pkgrel=//p' "$src_dir/PKGBUILD")"

  if git -C "$dst_dir" diff --quiet HEAD -- PKGBUILD .SRCINFO 2>/dev/null; then
    echo "[aur] $pkg $pkgver-$pkgrel 无需更新"
    continue
  fi

  echo "[aur] 变更："
  git -C "$dst_dir" --no-pager diff --stat HEAD -- PKGBUILD .SRCINFO || true

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[aur] --dry-run：跳过 commit / push"
    continue
  fi

  git -C "$dst_dir" add PKGBUILD .SRCINFO
  if git -C "$dst_dir" rev-parse --verify --quiet HEAD >/dev/null; then
    git -C "$dst_dir" commit --quiet -m "upgpkg: $pkg $pkgver-$pkgrel"
  else
    git -C "$dst_dir" commit --quiet -m "Initial import"
  fi
  git -C "$dst_dir" push --quiet origin master
  echo "[aur] 已推送 $pkg $pkgver-$pkgrel → https://aur.archlinux.org/packages/$pkg"
done

echo
echo "[aur] 完成。"
