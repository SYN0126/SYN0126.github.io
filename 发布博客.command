#!/bin/zsh

set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

pause_before_exit() {
    echo
    read -r "?按回车键关闭窗口…"
}

fail() {
    echo
    echo "发布没有完成：$1"
    pause_before_exit
    exit 1
}

echo "================================"
echo "        小龙的博客发布工具"
echo "================================"
echo

command -v git >/dev/null 2>&1 || fail "没有找到 Git。"
command -v hugo >/dev/null 2>&1 || fail "没有找到 Hugo。"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "当前文件夹不是 Git 仓库。"
git remote get-url origin >/dev/null 2>&1 || fail "没有找到名为 origin 的远端仓库。"

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "main" ]] || fail "当前分支是“${current_branch:-未知}”，请切换到 main 后再发布。"

echo "1/4 正在检查网站能否正常构建…"
temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/blog-publish.XXXXXX")" || fail "无法创建临时文件夹。"
trap 'rm -rf "$temp_dir"' EXIT

if ! hugo \
    --destination "$temp_dir/public" \
    --cacheDir "$temp_dir/cache" \
    --noBuildLock \
    --cleanDestinationDir \
    --minify \
    --printPathWarnings \
    --panicOnWarning; then
    fail "网站构建失败。请先根据上面的错误信息修改内容。"
fi

echo
echo "2/4 本次检测到的文件变化："
changes="$(git -c core.quotepath=false status --short)"

if [[ -z "$changes" ]]; then
    echo "没有新的文件变化。将尝试推送尚未发布的本地提交。"
    echo
    echo "3/4 不需要创建新提交。"
    echo "4/4 正在推送到 GitHub…"
    git push origin main || fail "推送失败。请检查网络或上面的 Git 提示。"
    echo
    echo "发布完成。GitHub Pages 稍后会自动更新网站。"
    pause_before_exit
    exit 0
fi

echo "$changes"
echo
read -r "?确认发布以上变化吗？直接回车表示确认，输入 n 取消：[Y/n] " publish_answer

if [[ "$publish_answer" == [nN] || "$publish_answer" == [nN][oO] ]]; then
    echo "已取消，没有提交或推送任何内容。"
    pause_before_exit
    exit 0
fi

echo
read -r "?请输入这次更新的说明，直接回车会自动生成：" commit_message

if [[ -z "${commit_message//[[:space:]]/}" ]]; then
    commit_message="更新博客 $(date '+%Y-%m-%d %H:%M')"
fi

echo
echo "3/4 正在创建本地提交：$commit_message"
git add -A || fail "无法把文件加入本次提交。"

if git diff --cached --quiet; then
    fail "没有可以提交的文件，可能所有变化都被 .gitignore 忽略了。"
fi

git -c core.quotepath=false diff --cached --stat
git commit -m "$commit_message" || fail "创建本地提交失败。"

echo
echo "4/4 正在推送到 GitHub…"
git push origin main || fail "本地提交已经保存，但推送失败。检查网络后再次运行本工具即可继续推送。"

echo
echo "发布完成。GitHub Pages 稍后会自动构建并更新网站。"
pause_before_exit
