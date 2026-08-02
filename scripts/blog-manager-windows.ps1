$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

$BlogDir = Split-Path -Parent $PSScriptRoot
$PostDir = Join-Path $BlogDir "content\posts"
$AboutFile = Join-Path $BlogDir "content\about.md"
$SiteUrl = "https://syn0126.github.io/"

Set-Location $BlogDir

function Pause-Menu {
    Write-Host ""
    [void](Read-Host "按回车键返回管理菜单")
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Get-FrontMatterValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $pattern = "^" + [Regex]::Escape($Key) + ":\s*(.*)$"
    $match = [Regex]::Match(
        $content,
        $pattern,
        [Text.RegularExpressions.RegexOptions]::Multiline
    )

    if (-not $match.Success) {
        return ""
    }

    $value = $match.Groups[1].Value.Trim()
    if ($value.Length -ge 2) {
        $doubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
        $singleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
        if ($doubleQuoted -or $singleQuoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }
    return $value
}

function Get-ArticleTitle {
    param([Parameter(Mandatory = $true)][string]$Path)

    $title = Get-FrontMatterValue -Path $Path -Key "title"
    if ([string]::IsNullOrWhiteSpace($title)) {
        return [System.IO.Path]::GetFileNameWithoutExtension($Path)
    }
    return $title
}

function Get-ArticleState {
    param([Parameter(Mandatory = $true)][string]$Path)

    $draft = Get-FrontMatterValue -Path $Path -Key "draft"
    if ($draft -eq "true") {
        return "草稿"
    }
    return "已发布"
}

function Get-ArticleTags {
    param([Parameter(Mandatory = $true)][string]$Path)

    $raw = Get-FrontMatterValue -Path $Path -Key "tags"
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return "未分类"
    }

    $clean = $raw.Trim('[', ']')
    $tags = @(
        $clean -split ',' |
            ForEach-Object { $_.Trim().Trim('"').Trim("'") } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    if ($tags.Count -eq 0) {
        return "未分类"
    }
    return ($tags -join "、")
}

function Get-Articles {
    if (-not (Test-Path -LiteralPath $PostDir)) {
        return @()
    }
    return @(
        Get-ChildItem -LiteralPath $PostDir -Filter "*.md" -File |
            Sort-Object Name -Descending
    )
}

function Show-Articles {
    $articles = @(Get-Articles)
    if ($articles.Count -eq 0) {
        Write-Host "目前没有文章。"
        return $false
    }

    for ($i = 0; $i -lt $articles.Count; $i++) {
        $file = $articles[$i]
        $title = Get-ArticleTitle -Path $file.FullName
        $state = Get-ArticleState -Path $file.FullName
        $tags = Get-ArticleTags -Path $file.FullName
        Write-Host ("{0,2}. [{1}] {2}" -f ($i + 1), $state, $title)
        Write-Host ("    标签：{0} · {1}" -f $tags, $file.Name)
    }
    return $true
}

function Select-Article {
    Write-Host ""
    $articles = @(Get-Articles)
    if ($articles.Count -eq 0) {
        Write-Host "目前没有文章。"
        return $null
    }

    [void](Show-Articles)
    Write-Host ""
    $selection = Read-Host "请输入文章序号，直接回车取消"
    if ([string]::IsNullOrWhiteSpace($selection)) {
        return $null
    }

    $index = 0
    if (-not [int]::TryParse($selection, [ref]$index) -or
        $index -lt 1 -or $index -gt $articles.Count) {
        Write-Host "序号无效。"
        return $null
    }
    return $articles[$index - 1]
}

function Escape-Yaml {
    param([AllowEmptyString()][string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"')
}

function Format-Tags {
    param([AllowEmptyString()][string]$Raw)

    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return '["未分类"]'
    }

    $normalized = $Raw.Replace('，', ',').Replace('；', ',').Replace(';', ',').Replace('#', ',')
    $items = @(
        $normalized -split '[,\s]+' |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )

    if ($items.Count -eq 0) {
        return '["未分类"]'
    }

    $quoted = @(
        $items | ForEach-Object { '"' + (Escape-Yaml $_) + '"' }
    )
    return '[' + ($quoted -join ', ') + ']'
}

function New-Article {
    Write-Host ""
    Write-Host "新建文章"
    Write-Host "--------"

    $title = Read-Host "中文标题，直接回车取消"
    if ([string]::IsNullOrWhiteSpace($title)) {
        return
    }

    $description = Read-Host "一句话简介（可选，直接回车跳过）"
    $slug = Read-Host "英文简称（可选，如 ai-tools；直接回车自动生成）"
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = "post-" + (Get-Date -Format "yyyyMMdd-HHmm")
    }
    $slug = $slug.ToLowerInvariant()

    if ($slug -notmatch '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$') {
        Write-Host "英文简称格式不正确，没有创建文章。"
        Pause-Menu
        return
    }

    foreach ($existing in @(Get-Articles)) {
        if ((Get-FrontMatterValue -Path $existing.FullName -Key "slug") -eq $slug) {
            Write-Host ("英文简称已经被文章“{0}”使用。" -f (Get-ArticleTitle $existing.FullName))
            Write-Host "没有创建文章，请换一个英文简称。"
            Pause-Menu
            return
        }
    }

    $tagInput = Read-Host "标签（可选，如 #思考 #效率；直接回车为“未分类”）"
    if (-not (Test-Path -LiteralPath $PostDir)) {
        [void](New-Item -ItemType Directory -Path $PostDir -Force)
    }

    $fileName = (Get-Date -Format "yyyy-MM-dd") + "-" + $slug + ".md"
    $file = Join-Path $PostDir $fileName
    if (Test-Path -LiteralPath $file) {
        Write-Host ("同名文章已经存在：{0}" -f $fileName)
        Pause-Menu
        return
    }

    $lines = @(
        "---",
        ('title: "' + (Escape-Yaml $title) + '"'),
        ('slug: "' + $slug + '"'),
        ('date: ' + (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")),
        ('description: "' + (Escape-Yaml $description) + '"'),
        ('tags: ' + (Format-Tags $tagInput)),
        "draft: true",
        "---",
        "",
        "正文写在这里。",
        "",
        "## 第一个小标题",
        ""
    )
    Write-Utf8File -Path $file -Content (($lines -join [Environment]::NewLine) + [Environment]::NewLine)

    Write-Host ""
    Write-Host ("已创建草稿：{0}" -f $fileName)
    Write-Host ("标签：{0}" -f (Get-ArticleTags $file))
    Write-Host "写完后使用“隐藏或发布文章”把它改成发布状态。"
    Start-Process -FilePath "notepad.exe" -ArgumentList ('"' + $file + '"')
    Pause-Menu
}

function List-Articles {
    Write-Host ""
    Write-Host "文章列表"
    Write-Host "--------"
    [void](Show-Articles)
    Pause-Menu
}

function Edit-Article {
    $article = Select-Article
    if ($null -eq $article) {
        Pause-Menu
        return
    }

    Write-Host ""
    Write-Host ("正在打开：{0}" -f (Get-ArticleTitle $article.FullName))
    Start-Process -FilePath "notepad.exe" -ArgumentList ('"' + $article.FullName + '"')
    Pause-Menu
}

function Edit-About {
    Write-Host ""
    Write-Host "正在打开“关于”页……"
    Start-Process -FilePath "notepad.exe" -ArgumentList ('"' + $AboutFile + '"')
    Pause-Menu
}

function Toggle-Article {
    $article = Select-Article
    if ($null -eq $article) {
        Pause-Menu
        return
    }

    $state = Get-ArticleState -Path $article.FullName
    Write-Host ""
    Write-Host ("文章：{0}" -f (Get-ArticleTitle $article.FullName))
    Write-Host ("当前状态：{0}" -f $state)
    $content = [System.IO.File]::ReadAllText($article.FullName)

    if ($state -eq "草稿") {
        $answer = Read-Host "要把这篇文章设为“已发布”吗？[y/N]"
        if ($answer -match '^(y|yes)$') {
            $content = [Regex]::Replace($content, '^draft:\s*true\s*$', 'draft: false', [Text.RegularExpressions.RegexOptions]::Multiline)
            Write-Utf8File -Path $article.FullName -Content $content
            Write-Host "已经设为发布状态。运行一键发布后，文章会出现在网站上。"
        } else {
            Write-Host "没有修改。"
        }
    } else {
        if ((Get-FrontMatterValue -Path $article.FullName -Key "draft") -ne "false") {
            Write-Host "文章里没有可识别的 draft 设置，请手动编辑该文章。"
            Pause-Menu
            return
        }
        $answer = Read-Host "要把这篇文章隐藏为草稿吗？[y/N]"
        if ($answer -match '^(y|yes)$') {
            $content = [Regex]::Replace($content, '^draft:\s*false\s*$', 'draft: true', [Text.RegularExpressions.RegexOptions]::Multiline)
            Write-Utf8File -Path $article.FullName -Content $content
            Write-Host "已经隐藏为草稿。运行一键发布后，网站上将不再显示它。"
        } else {
            Write-Host "没有修改。"
        }
    }
    Pause-Menu
}

function Delete-Article {
    $article = Select-Article
    if ($null -eq $article) {
        Pause-Menu
        return
    }

    Write-Host ""
    Write-Host ("准备移到回收站：{0}" -f (Get-ArticleTitle $article.FullName))
    Write-Host "发布这次删除后，原来的文章网址会变成 404。"
    $answer = Read-Host "确定继续吗？[y/N]"
    if ($answer -notmatch '^(y|yes)$') {
        Write-Host "没有删除。"
        Pause-Menu
        return
    }

    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
        $article.FullName,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
    Write-Host "文章已经移到回收站。运行一键发布后，线上文章才会删除。"
    Pause-Menu
}

function Preview-Site {
    Write-Host ""
    $hugo = Get-Command "hugo" -ErrorAction SilentlyContinue
    if ($null -eq $hugo) {
        Write-Host "没有找到 Hugo，无法启动本地预览。"
        Pause-Menu
        return
    }

    Write-Host "正在启动本地预览……"
    $arguments = @(
        "server", "-D", "--noBuildLock", "--printPathWarnings",
        "--bind", "127.0.0.1", "--port", "1313"
    )
    $preview = Start-Process -FilePath $hugo.Source -ArgumentList $arguments -WorkingDirectory $BlogDir -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 1
    $preview.Refresh()
    if ($preview.HasExited) {
        Write-Host "预览启动失败，请确认 Hugo 已正确安装。"
        Pause-Menu
        return
    }

    Start-Process "http://localhost:1313/"
    Write-Host "预览已在浏览器打开，草稿文章也会显示。"
    [void](Read-Host "查看完成后按回车键停止预览")
    if (-not $preview.HasExited) {
        Stop-Process -Id $preview.Id -Force
    }
}

function Publish-Site {
    Write-Host ""
    Write-Host "================================"
    Write-Host "          一键发布博客"
    Write-Host "================================"
    Write-Host ""

    if ($null -eq (Get-Command "git" -ErrorAction SilentlyContinue)) {
        Write-Host "发布没有完成：没有找到 Git。"
        Pause-Menu
        return
    }
    if ($null -eq (Get-Command "hugo" -ErrorAction SilentlyContinue)) {
        Write-Host "发布没有完成：没有找到 Hugo。"
        Pause-Menu
        return
    }

    & git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "发布没有完成：当前文件夹不是 Git 仓库。"
        Pause-Menu
        return
    }
    & git remote get-url origin *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "发布没有完成：没有找到名为 origin 的远端仓库。"
        Pause-Menu
        return
    }

    $branch = ((& git branch --show-current 2>$null) | Out-String).Trim()
    if ($branch -ne "main") {
        Write-Host ("发布没有完成：当前分支是“{0}”，请切换到 main 后再发布。" -f $branch)
        Pause-Menu
        return
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("blog-publish-" + [Guid]::NewGuid().ToString("N"))
    [void](New-Item -ItemType Directory -Path $tempDir)

    try {
        Write-Host "1/4 正在检查网站能否正常构建……"
        & hugo `
            --destination (Join-Path $tempDir "public") `
            --cacheDir (Join-Path $tempDir "cache") `
            --noBuildLock `
            --cleanDestinationDir `
            --minify `
            --printPathWarnings `
            --panicOnWarning
        if ($LASTEXITCODE -ne 0) {
            Write-Host "发布没有完成：网站构建失败。请先根据上面的错误信息修改内容。"
            Pause-Menu
            return
        }

        Write-Host ""
        Write-Host "2/4 本次检测到的文件变化："
        $changes = @(& git -c core.quotepath=false status --short)
        if ($changes.Count -eq 0) {
            Write-Host "没有新的文件变化。将尝试推送尚未发布的本地提交。"
            Write-Host ""
            Write-Host "3/4 不需要创建新提交。"
            Write-Host "4/4 正在推送到 GitHub……"
            & git push origin main
            if ($LASTEXITCODE -ne 0) {
                Write-Host "发布没有完成：推送失败。请检查网络或上面的 Git 提示。"
                Pause-Menu
                return
            }
            Write-Host ""
            Write-Host "发布完成。GitHub Pages 稍后会自动更新网站。"
            Pause-Menu
            return
        }

        $changes | ForEach-Object { Write-Host $_ }
        Write-Host ""
        $answer = Read-Host "确认发布以上变化吗？直接回车表示确认，输入 n 取消：[Y/n]"
        if ($answer -match '^(n|no)$') {
            Write-Host "已取消，没有提交或推送任何内容。"
            Pause-Menu
            return
        }

        Write-Host ""
        $message = Read-Host "请输入这次更新的说明，直接回车会自动生成"
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "更新博客 " + (Get-Date -Format "yyyy-MM-dd HH:mm")
        }

        Write-Host ""
        Write-Host ("3/4 正在创建本地提交：{0}" -f $message)
        & git add -A
        if ($LASTEXITCODE -ne 0) {
            Write-Host "发布没有完成：无法把文件加入本次提交。"
            Pause-Menu
            return
        }

        & git diff --cached --quiet
        if ($LASTEXITCODE -eq 0) {
            Write-Host "发布没有完成：没有可以提交的文件。"
            Pause-Menu
            return
        }

        & git -c core.quotepath=false diff --cached --stat
        & git commit -m $message
        if ($LASTEXITCODE -ne 0) {
            Write-Host "发布没有完成：创建本地提交失败。"
            Pause-Menu
            return
        }

        Write-Host ""
        Write-Host "4/4 正在推送到 GitHub……"
        & git push origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "本地提交已经保存，但推送失败。检查网络后再次运行本工具即可继续推送。"
            Pause-Menu
            return
        }

        Write-Host ""
        Write-Host "发布完成。GitHub Pages 稍后会自动更新网站。"
        Pause-Menu
    } finally {
        if (Test-Path -LiteralPath $tempDir) {
            Remove-Item -LiteralPath $tempDir -Recurse -Force
        }
    }
}

function Open-Site {
    Start-Process $SiteUrl
    Write-Host ""
    Write-Host ("已打开：{0}" -f $SiteUrl)
    Pause-Menu
}

function Start-BlogManager {
    while ($true) {
        Clear-Host
        $git = Get-Command "git" -ErrorAction SilentlyContinue
        if ($null -eq $git) {
            $pendingCount = 0
        } else {
            $pendingCount = @(& git status --porcelain 2>$null).Count
        }

        Write-Host "================================"
        Write-Host "        小龙的博客管理工具"
        Write-Host "           Windows 版"
        Write-Host "================================"
        Write-Host ("当前有 {0} 个尚未提交的文件变化" -f $pendingCount)
        Write-Host ""
        Write-Host "1. 新建文章"
        Write-Host "2. 查看文章列表"
        Write-Host "3. 编辑文章"
        Write-Host "4. 编辑“关于”页"
        Write-Host "5. 隐藏或发布文章"
        Write-Host "6. 删除文章（移到回收站）"
        Write-Host "7. 本地预览"
        Write-Host "8. 一键发布到 GitHub"
        Write-Host "9. 打开线上博客"
        Write-Host "0. 退出"
        Write-Host ""

        $choice = Read-Host "请选择操作"
        switch ($choice) {
            "1" { New-Article }
            "2" { List-Articles }
            "3" { Edit-Article }
            "4" { Edit-About }
            "5" { Toggle-Article }
            "6" { Delete-Article }
            "7" { Preview-Site }
            "8" { Publish-Site }
            "9" { Open-Site }
            "0" {
                Write-Host "已退出。"
                return
            }
            default {
                Write-Host "请输入 0 到 9。"
                Pause-Menu
            }
        }
    }
}

try {
    Start-BlogManager
} catch {
    Write-Host ""
    Write-Host ("管理工具发生错误：{0}" -f $_.Exception.Message)
    Pause-Menu
    exit 1
}
