#!/bin/zsh

set -e

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"
export ASTRO_TELEMETRY_DISABLED=1

if [[ ! -d node_modules ]]; then
    echo "首次启动，正在安装依赖…"
    npm install
fi

echo "炫光版将在 http://localhost:4321 打开。"
npm run dev -- --host 127.0.0.1
