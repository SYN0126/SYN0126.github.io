#!/bin/zsh
# 原版博客管理.command 保留；2.0 使用 macOS 弹窗。
set -u
SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:$PATH"
export ASTRO_TELEMETRY_DISABLED=1

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    /usr/bin/osascript -e 'display alert "无法打开博客管理 2.0" message "没有找到 Node.js/npm，请先安装 Node.js。" as critical' >/dev/null
    exit 1
fi

if ! node -e 'require.resolve("gray-matter")' >/dev/null 2>&1; then
    /usr/bin/osascript -e 'display dialog "首次使用需要安装博客依赖，安装进度会显示在终端。" buttons {"取消", "安装"} default button "安装" cancel button "取消" with title "博客管理 2.0"' >/dev/null || exit 0
    if ! npm ci --no-audit --no-fund; then
        /usr/bin/osascript -e 'display alert "依赖安装失败" message "请查看终端错误，修复后重新打开管理器。" as critical' >/dev/null
        exit 1
    fi
fi

exec node "$SCRIPT_DIR/scripts/blog-manager-v2.mjs"
