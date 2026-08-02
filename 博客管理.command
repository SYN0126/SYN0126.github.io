#!/bin/zsh

set -u

SCRIPT_DIR="${0:A:h}"
POST_DIR="$SCRIPT_DIR/content/posts"
ABOUT_FILE="$SCRIPT_DIR/content/about.md"
SITE_URL="https://syn0126.github.io/"
SELECTED_ARTICLE=""
preview_pid=""
preview_log=""

cd "$SCRIPT_DIR" || exit 1

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

trap cleanup_preview EXIT INT TERM

article_title() {
    local file="$1"
    local title

    title="$(sed -n 's/^title:[[:space:]]*//p' "$file" | head -n 1)"
    title="${title#\"}"
    title="${title%\"}"

    if [[ -z "$title" ]]; then
        title="$(basename "$file" .md)"
    fi

    print -r -- "$title"
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

    tags="$(sed -n 's/^tags:[[:space:]]*//p' "$file" | head -n 1)"
    tags="${tags//[\[\]\"\']/}"
    tags="${tags//,/、}"
    tags="${tags//[[:space:]]/}"

    print -r -- "${tags:-未分类}"
}

load_articles() {
    articles=("$POST_DIR"/*.md(NOn))
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
        printf "    标签：%s · %s\n" "$(article_tags "$file")" "$(basename "$file")"
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

new_article() {
    echo
    echo "新建文章"
    echo "--------"

    local title
    local description
    local tags_input
    local formatted_tags
    local slug
    local default_slug
    local file
    local article_date
    local escaped_title
    local escaped_description
    local existing_file

    read -r "?中文标题，直接回车取消：" title
    [[ -n "${title//[[:space:]]/}" ]] || return

    read -r "?一句话简介（可选，直接回车跳过）：" description

    default_slug="post-$(date '+%Y%m%d-%H%M')"
    read -r "?英文简称（可选，如 ai-tools；直接回车自动生成）：" slug
    slug="${slug:-$default_slug}"
    slug="${slug:l}"

    if [[ ! "$slug" =~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$' ]]; then
        echo "网址短名格式不正确，没有创建文章。"
        pause_menu
        return
    fi

    for existing_file in "$POST_DIR"/*.md(N); do
        if grep -Eq "^slug:[[:space:]]*[\"']?${slug}[\"']?[[:space:]]*$" "$existing_file"; then
            echo "网址短名已经被这篇文章使用：$(article_title "$existing_file")"
            echo "没有创建文章，请换一个网址短名。"
            pause_menu
            return
        fi
    done

    read -r "?标签（可选，如 #思考 #效率；直接回车为“未分类”）：" tags_input

    file="$POST_DIR/$(date '+%Y-%m-%d')-${slug}.md"
    if [[ -e "$file" ]]; then
        echo "同名文章已经存在：$(basename "$file")"
        pause_menu
        return
    fi

    mkdir -p "$POST_DIR"
    article_date="$(date '+%Y-%m-%dT%H:%M:%S%z' | sed -E 's/([+-][0-9]{2})([0-9]{2})$/\1:\2/')"
    escaped_title="$(yaml_escape "$title")"
    escaped_description="$(yaml_escape "$description")"
    formatted_tags="$(format_tags "$tags_input")"

    {
        echo "---"
        echo "title: \"$escaped_title\""
        echo "slug: \"$slug\""
        echo "date: $article_date"
        echo "description: \"$escaped_description\""
        echo "tags: $formatted_tags"
        echo "draft: true"
        echo "---"
        echo
        echo "正文写在这里。"
        echo
        echo "## 第一个小标题"
        echo
    } > "$file"

    echo
    echo "已创建草稿：$(basename "$file")"
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

    local current_state
    local answer
    current_state="$(article_state "$SELECTED_ARTICLE")"

    echo
    echo "文章：$(article_title "$SELECTED_ARTICLE")"
    echo "当前状态：$current_state"

    if [[ "$current_state" == "草稿" ]]; then
        read -r "?要把这篇文章设为“已发布”吗？[y/N] " answer
        if [[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]]; then
            sed -i '' -E 's/^draft:[[:space:]]*true[[:space:]]*$/draft: false/' "$SELECTED_ARTICLE"
            echo "已经设为发布状态。运行一键发布后，文章会出现在网站上。"
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
            echo "已经隐藏为草稿。运行一键发布后，网站上将不再显示它。"
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

    local answer
    local trash_dir
    local trash_target
    local file_name
    echo
    echo "准备移到废纸篓：$(article_title "$SELECTED_ARTICLE")"
    echo "发布这次删除后，原来的文章网址会变成 404。"
    read -r "?确定继续吗？[y/N] " answer

    if [[ "$answer" != [yY] && "$answer" != [yY][eE][sS] ]]; then
        echo "没有删除。"
        pause_menu
        return
    fi

    trash_dir="$HOME/.Trash"
    file_name="$(basename "$SELECTED_ARTICLE")"
    trash_target="$trash_dir/$file_name"

    if [[ -e "$trash_target" ]]; then
        trash_target="$trash_dir/${file_name%.md}-$(date '+%Y%m%d-%H%M%S').md"
    fi

    if [[ -d "$trash_dir" ]] && mv -- "$SELECTED_ARTICLE" "$trash_target"; then
        echo "文章已经移到废纸篓。运行一键发布后，线上文章才会删除。"
    else
        echo "无法移到废纸篓，没有删除文章。"
    fi

    pause_menu
}

preview_site() {
    echo
    echo "正在启动本地预览…"

    preview_log="/tmp/blog-preview-$$.log"
    hugo server -D --noBuildLock --printPathWarnings --bind 127.0.0.1 --port 1313 > "$preview_log" 2>&1 &
    preview_pid=$!
    sleep 1

    if ! kill -0 "$preview_pid" 2>/dev/null; then
        echo "预览启动失败："
        sed -n '1,120p' "$preview_log"
        cleanup_preview
        pause_menu
        return
    fi

    open "http://localhost:1313/" 2>/dev/null || true
    echo "预览已在浏览器打开，草稿文章也会显示。"
    echo "查看完成后回到这个窗口。"
    echo
    read -r "?按回车键停止预览并返回菜单…"
    cleanup_preview
}

publish_site() {
    if [[ ! -x "$SCRIPT_DIR/发布博客.command" ]]; then
        echo "没有找到可运行的“发布博客.command”。"
        pause_menu
        return
    fi

    "$SCRIPT_DIR/发布博客.command"
}

open_site() {
    open "$SITE_URL" 2>/dev/null || echo "请在浏览器打开：$SITE_URL"
    echo
    echo "已打开：$SITE_URL"
    pause_menu
}

while true; do
    clear
    pending_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

    echo "================================"
    echo "        小龙的博客管理工具"
    echo "================================"
    echo "当前有 $pending_count 个尚未提交的文件变化"
    echo
    echo "1. 新建文章"
    echo "2. 查看文章列表"
    echo "3. 编辑文章"
    echo "4. 编辑“关于”页"
    echo "5. 隐藏或发布文章"
    echo "6. 删除文章（移到废纸篓）"
    echo "7. 本地预览"
    echo "8. 一键发布到 GitHub"
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
