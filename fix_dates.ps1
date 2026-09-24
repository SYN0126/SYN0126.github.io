Get-ChildItem -Path "src/content/blog" -Recurse -Include *.md | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw -Encoding UTF8
    $newContent = $content -replace 'publishDate:\s*["'']?(\d{4})(\d{2})(\d{2})["'']?', 'publishDate: $1-$2-$3'
    if ($newContent -ne $content) {
        $newContent | Set-Content $file -Encoding UTF8
        Write-Output "Fixed date in $file"
    }
}
