#!/bin/zsh

set -u

SCRIPT_DIR="${0:A:h}"
POST_DIR="$SCRIPT_DIR/src/content/blog"
ABOUT_FILE="$SCRIPT_DIR/src/content/about.md"
SITE_URL="https://syn0126.github.io/"
SELECTED_ARTICLE=""
preview_pid=""
preview_log=""

cd "$SCRIPT_DIR" || exit 1
export ASTRO_TELEMETRY_DISABLED=1

pause_menu() {
    echo
    read -r "?按回车键返回管理菜单…"
}

cleanup_preview() {
    if [[ -n "$preview_pid" ]] && kill -0 "$preview_pid" 2>/dev/null; then
        kill "$preview_pid" 2>/dev/null
        wait "$preview_pid" 2>/dev/null
    fi
    [[ -n "$preview_log" ]] && rm -f -- "$preview_log"
    preview_pid=""
    preview_log=""
}

trap 'cleanup_preview' EXIT INT TERM

article_title() {
    local file="$1"
    local title

    title="$(sed -n 's/^title:[[:space:]]*//p' "$file" | head -n 1)"
    title="${title#\"}"
    title="${title%\"}"
    title="${title#\'}"
    title="${title%\'}"
    print -r -- "${title:-$(basename "${file:h}")}"
}

article_state() {
    local file="$1"

    if grep -Eq '^draft:[[:space:]]*true[[:space:]]*$' "$file"; then
        print -r -- "草稿"
    else
        print -r -- "已发布"
    fi
}

article_tags() {
    local file="$1"
    local tags

    tags="$(awk '
        /^tags:[[:space:]]*/ {
            value = $0
            sub(/^tags:[[:space:]]*/, "", value)
            if (length(value) > 0) print value
            reading = 1
            next
        }
        reading {
            if ($0 ~ /^[[:alnum:]_-]+:[[:space:]]*/) exit
            value = $0
            sub(/^[[:space:]]*-[[:space:]]*/, "", value)
            if (value !~ /^[[:space:]]*$/) print value
        }
    ' "$file" | tr '\n' ',')"

    tags="${tags//[\[\]\"\']/}"
    tags="${tags//, /,}"
    tags="${tags//,/、}"
    tags="${tags%、}"
    print -r -- "${tags:-未分类}"
}

load_articles() {
    articles=("$POST_DIR"/*/index.md(NOn))
}

print_articles() {
    load_articles

    if (( ${#articles[@]} == 0 )); then
        echo "目前没有文章。"
        return 1
    fi

    local index=1
    local file
    for file in "${articles[@]}"; do
        printf "%2d. [%s] %s\n" "$index" "$(article_state "$file")" "$(article_title "$file")"
        printf "    标签：%s · %s\n" "$(article_tags "$file")" "$(basename "${file:h}")"
        (( index++ ))
    done
}

select_article() {
    echo
    print_articles || return 1
    echo

    local selection
    read -r "?请输入文章序号，直接回车取消：" selection

    if [[ -z "$selection" ]]; then
        return 1
    fi

    if [[ "$selection" != <-> ]] || (( selection < 1 || selection > ${#articles[@]} )); then
        echo "序号无效。"
        return 1
    fi

    SELECTED_ARTICLE="${articles[$selection]}"
    return 0
}

yaml_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    print -r -- "$value"
}

format_tags() {
    local raw="$1"
    local tag
    local escaped_tag
    local -a values
    local -a tags

    if [[ -z "${raw//[[:space:]]/}" ]]; then
        print -r -- '["未分类"]'
        return
    fi

    raw="${raw//，/,}"
    raw="${raw//；/,}"
    raw="${raw//;/,}"
    raw="${raw//\#/,}"
    raw="${raw//[[:space:]]/,}"
    values=("${(@s:,:)raw}")

    for tag in "${values[@]}"; do
        [[ -n "$tag" ]] || continue
        escaped_tag="$(yaml_escape "$tag")"
        tags+=("\"$escaped_tag\"")
    done

    if (( ${#tags[@]} == 0 )); then
        print -r -- '["未分类"]'
    else
        print -r -- "[${(j:, :)tags}]"
    fi
}

ensure_dependencies() {
    if ! command -v npm >/dev/null 2>&1; then
        echo "没有找到 Node.js/npm，无法运行炫光版。"
        echo "请先安装 Node.js： https://nodejs.org/"
        return 1
    fi

    if [[ ! -d node_modules ]]; then
        echo "首次运行，正在安装依赖…"
        if ! npm install; then
            echo "依赖安装失败，请检查网络和上面的 npm 提示。"
            return 1
        fi
    fi
}

new_article() {
    echo
    echo "新建文章"
    echo "--------"

    local title description tags_input formatted_tags slug default_slug
    local article_dir file article_date escaped_title escaped_description

    read -r "?中文标题，直接回车取消：" title
    [[ -n "${title//[[:space:]]/}" ]] || return

    read -r "?一句话简介（可选，直接回车跳过）：" description

    default_slug="post-$(date '+%Y%m%d-%H%M')"
    read -r "?英文简称（可选，如 ai-tools；直接回车自动生成）：" slug
    slug="${slug:-$default_slug}"
    slug="${slug:l}"

    if [[ ! "$slug" =~ '^[a-z0-9]+(-[a-z0-9]+)*$' ]]; then
        echo "网址短名格式不正确，没有创建文章。"
        pause_menu
        return
    fi

    article_dir="$POST_DIR/$slug"
    file="$article_dir/index.md"
    if [[ -e "$article_dir" ]]; then
        echo "网址短名已经存在：$slug"
        echo "没有创建文章，请换一个网址短名。"
        pause_menu
        return
    fi

    read -r "?标签（可选，如 #思考 #效率；直接回车为“未分类”）：" tags_input

    mkdir -p "$article_dir"
    article_date="$(date '+%Y-%m-%dT%H:%M:%S%z' | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/')"
    escaped_title="$(yaml_escape "$title")"
    escaped_description="$(yaml_escape "$description")"
    formatted_tags="$(format_tags "$tags_input")"

    {
        echo "---"
        echo "title: \"$escaped_title\""
        echo "description: \"$escaped_description\""
        echo "publishDate: $article_date"
        echo "tags: $formatted_tags"
        echo "categories: []"
        echo "language: zh-CN"
        echo "draft: true"
        echo "comment: false"
        echo "---"
        echo
        echo "正文写在这里。"
        echo
        echo "## 第一个小标题"
        echo
    } > "$file"

    echo
    echo "已创建草稿：$slug/index.md"
    echo "标签：$(article_tags "$file")"
    echo "写完后使用“隐藏或发布文章”把它改成发布状态。"

    if ! open -a TextEdit "$file" 2>/dev/null; then
        open "$file" 2>/dev/null || true
        echo "请手动打开：$file"
    fi

    pause_menu
}

list_articles() {
    echo
    echo "文章列表"
    echo "--------"
    print_articles
    pause_menu
}

edit_article() {
    select_article || {
        pause_menu
        return
    }

    echo
    echo "正在打开：$(article_title "$SELECTED_ARTICLE")"
    if ! open -a TextEdit "$SELECTED_ARTICLE" 2>/dev/null; then
        open "$SELECTED_ARTICLE" 2>/dev/null || true
        echo "请手动打开：$SELECTED_ARTICLE"
    fi

    pause_menu
}

edit_about() {
    echo
    echo "正在打开“关于”页…"
    if ! open -a TextEdit "$ABOUT_FILE" 2>/dev/null; then
        open "$ABOUT_FILE" 2>/dev/null || true
        echo "请手动打开：$ABOUT_FILE"
    fi

    pause_menu
}

toggle_article() {
    select_article || {
        pause_menu
        return
    }

    local current_state answer
    current_state="$(article_state "$SELECTED_ARTICLE")"

    echo
    echo "文章：$(article_title "$SELECTED_ARTICLE")"
    echo "当前状态：$current_state"

    if [[ "$current_state" == "草稿" ]]; then
        read -r "?要把这篇文章设为“已发布”吗？[y/N] " answer
        if [[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]]; then
            sed -i '' -E 's/^draft:[[:space:]]*true[[:space:]]*$/draft: false/' "$SELECTED_ARTICLE"
            echo "已经设为发布状态。运行构建/发布后，文章会出现在网站上。"
        else
            echo "没有修改。"
        fi
    else
        if ! grep -Eq '^draft:[[:space:]]*false[[:space:]]*$' "$SELECTED_ARTICLE"; then
            echo "文章里没有可识别的 draft 设置，请手动编辑该文章。"
            pause_menu
            return
        fi

        read -r "?要把这篇文章隐藏为草稿吗？[y/N] " answer
        if [[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]]; then
            sed -i '' -E 's/^draft:[[:space:]]*false[[:space:]]*$/draft: true/' "$SELECTED_ARTICLE"
            echo "已经隐藏为草稿。运行构建/发布后，网站上将不再显示它。"
        else
            echo "没有修改。"
        fi
    fi

    pause_menu
}

delete_article() {
    select_article || {
        pause_menu
        return
    }

    local answer article_dir trash_dir trash_target slug
    article_dir="${SELECTED_ARTICLE:h}"
    slug="$(basename "$article_dir")"
    echo
    echo "准备把整篇文章移到废纸篓：$(article_title "$SELECTED_ARTICLE")"
    echo "文章目录里的配图也会一起移动；发布后原网址会变成 404。"
    read -r "?确定继续吗？[y/N] " answer

    if [[ "$answer" != [yY] && "$answer" != [yY][eE][sS] ]]; then
        echo "没有删除。"
        pause_menu
        return
    fi

    trash_dir="$HOME/.Trash"
    trash_target="$trash_dir/$slug"
    if [[ -e "$trash_target" ]]; then
        trash_target="$trash_dir/${slug}-$(date '+%Y%m%d-%H%M%S')"
    fi

    if [[ -d "$trash_dir" ]] && mv -- "$article_dir" "$trash_target"; then
        echo "文章已经移到废纸篓。运行构建/发布后，线上文章才会删除。"
    else
        echo "无法移到废纸篓，没有删除文章。"
    fi

    pause_menu
}

preview_site() {
    echo
    ensure_dependencies || {
        pause_menu
        return
    }

    echo "正在启动本地预览…"
    preview_log="$(mktemp "${TMPDIR:-/tmp}/glow-blog-preview.XXXXXX")" || {
        echo "无法创建预览日志。"
        pause_menu
        return
    }

    npm run dev -- --host 127.0.0.1 --port 4321 > "$preview_log" 2>&1 &
    preview_pid=$!
    sleep 2

    if ! kill -0 "$preview_pid" 2>/dev/null; then
        echo "预览启动失败："
        sed -n '1,160p' "$preview_log"
        cleanup_preview
        pause_menu
        return
    fi

    open "http://localhost:4321/" 2>/dev/null || true
    echo "预览已在浏览器打开，草稿文章也会显示。"
    echo "查看完成后回到这个窗口。"
    echo
    read -r "?按回车键停止预览并返回菜单…"
    cleanup_preview
}

build_site() {
    ensure_dependencies || return 1
    echo "正在检查并构建网站…"
    if ! npm run build; then
        echo "构建失败，请根据上面的错误信息修改内容。"
        return 1
    fi
    echo "网站构建成功，静态文件在：$SCRIPT_DIR/dist"
}

publish_site() {
    local current_branch changes publish_answer commit_message

    echo
    echo "================================"
    echo "       构建 / 发布炫光版"
    echo "================================"
    echo

    build_site || {
        pause_menu
        return
    }

    echo
    if ! command -v git >/dev/null 2>&1; then
        echo "本地构建已完成，但没有找到 Git，所以没有发布。"
        pause_menu
        return
    fi
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "本地构建已完成。"
        echo "这个独立版本尚未绑定 Git 仓库，因此不会覆盖另外两个版本或线上博客。"
        echo "需要发布时，可以单独为“炫光版”配置 GitHub 仓库。"
        pause_menu
        return
    fi
    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "本地构建已完成，但没有 origin 远端，因此没有发布。"
        pause_menu
        return
    fi

    current_branch="$(git branch --show-current)"
    if [[ "$current_branch" != "main" ]]; then
        echo "没有发布：当前分支是“${current_branch:-未知}”，请切换到 main。"
        pause_menu
        return
    fi

    echo
    echo "本次检测到的文件变化："
    changes="$(git -c core.quotepath=false status --short)"

    if [[ -z "$changes" ]]; then
        echo "没有新的文件变化，将尝试推送尚未发布的提交。"
        if git push origin main; then
            echo "发布完成。GitHub Pages 稍后会自动更新网站。"
        else
            echo "推送失败，请检查网络或上面的 Git 提示。"
        fi
        pause_menu
        return
    fi

    echo "$changes"
    echo
    read -r "?确认发布以上变化吗？直接回车表示确认，输入 n 取消：[Y/n] " publish_answer
    if [[ "$publish_answer" == [nN] || "$publish_answer" == [nN][oO] ]]; then
        echo "已取消，没有提交或推送任何内容。"
        pause_menu
        return
    fi

    read -r "?请输入这次更新的说明，直接回车会自动生成：" commit_message
    if [[ -z "${commit_message//[[:space:]]/}" ]]; then
        commit_message="更新炫光版博客 $(date '+%Y-%m-%d %H:%M')"
    fi

    if ! git add -A; then
        echo "无法把文件加入本次提交。"
        pause_menu
        return
    fi
    if git diff --cached --quiet; then
        echo "没有可以提交的文件。"
        pause_menu
        return
    fi

    git -c core.quotepath=false diff --cached --stat
    if ! git commit -m "$commit_message"; then
        echo "创建本地提交失败。"
        pause_menu
        return
    fi

    if git push origin main; then
        echo "发布完成。GitHub Pages 稍后会自动更新网站。"
    else
        echo "本地提交已经保存，但推送失败；修复网络后再次运行即可继续推送。"
    fi
    pause_menu
}

open_site() {
    open "$SITE_URL" 2>/dev/null || echo "请在浏览器打开：$SITE_URL"
    echo
    echo "已打开：$SITE_URL"
    pause_menu
}

while true; do
    clear
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        pending_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
        repo_status="Git 中有 $pending_count 个尚未提交的文件变化"
    else
        repo_status="独立本地版本（尚未绑定 Git 仓库）"
    fi

    echo "================================"
    echo "      小龙的炫光版博客管理工具"
    echo "================================"
    echo "$repo_status"
    echo
    echo "1. 新建文章"
    echo "2. 查看文章列表"
    echo "3. 编辑文章"
    echo "4. 编辑“关于”页"
    echo "5. 隐藏或发布文章"
    echo "6. 删除文章（移到废纸篓）"
    echo "7. 本地预览"
    echo "8. 构建网站 / 发布到 GitHub"
    echo "9. 打开线上博客"
    echo "0. 退出"
    echo

    read -r "?请选择操作：" menu_choice

    case "$menu_choice" in
        1) new_article ;;
        2) list_articles ;;
        3) edit_article ;;
        4) edit_about ;;
        5) toggle_article ;;
        6) delete_article ;;
        7) preview_site ;;
        8) publish_site ;;
        9) open_site ;;
        0)
            echo "已退出。"
            exit 0
            ;;
        *)
            echo "请输入 0 到 9。"
            pause_menu
            ;;
    esac
done
