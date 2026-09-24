import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const sourceRoot = process.env.HUGO_SOURCE || 'E:/my_website/content/post'
const targetRoot = path.resolve('src/content/blog')

const cleanText = (body) => body
  .replace(/<[^>]+>/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/[#*_>`~\[\](){}|-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const safeSlug = (value) => String(value)
  .trim()
  .replace(/[<>:"/\\|?*]/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80)

const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value]

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

if (fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true })
fs.mkdirSync(targetRoot, { recursive: true })
const markdownFiles = walk(sourceRoot).filter((file) => file.toLowerCase().endsWith('.md'))
const used = new Set()

for (const file of markdownFiles) {
  const raw = fs.readFileSync(file, 'utf8')
  const parsed = matter(raw)
  const baseName = path.basename(file, path.extname(file))
  const fallbackName = baseName.toLowerCase() === 'index' || baseName.length > 80
    ? path.basename(path.dirname(file))
    : baseName
  let slug = safeSlug(parsed.data.slug || fallbackName) || 'post'
  let unique = slug
  let suffix = 2
  while (used.has(unique.toLowerCase())) unique = `${slug}-${suffix++}`
  slug = unique
  used.add(slug.toLowerCase())

  const summary = parsed.data.description || parsed.data.summary || cleanText(parsed.content).slice(0, 150) || parsed.data.title || fallbackName
  const tags = [...new Set([...asArray(parsed.data.tags), ...asArray(parsed.data.categories)].map(String).filter(Boolean))]
  const publishDate = parsed.data.date || parsed.data.publishDate || fs.statSync(file).birthtime.toISOString()
  const updatedDate = parsed.data.lastmod || parsed.data.updatedDate
  const data = {
    title: String(parsed.data.title || fallbackName).slice(0, 120),
    description: String(summary).slice(0, 160),
    publishDate: new Date(publishDate).toISOString(),
    ...(updatedDate ? { updatedDate: new Date(updatedDate).toISOString() } : {}),
    tags,
    categories: asArray(parsed.data.categories).map(String),
    language: parsed.data.language || 'zh-CN',
    draft: Boolean(parsed.data.draft),
    comment: parsed.data.comments !== false,
    ...(typeof parsed.data.image === 'string' ? { coverUrl: parsed.data.image.replace(/^http:/, 'https:') } : {}),
    originalPath: path.relative(path.dirname(sourceRoot), file).replaceAll('\\', '/')
  }

  const destinationDir = path.join(targetRoot, slug)
  fs.mkdirSync(destinationDir, { recursive: true })
  fs.writeFileSync(path.join(destinationDir, 'index.md'), matter.stringify(parsed.content, data), 'utf8')

  for (const sibling of fs.readdirSync(path.dirname(file), { withFileTypes: true })) {
    if (!sibling.isFile() || sibling.name === path.basename(file) || sibling.name.toLowerCase().endsWith('.md')) continue
    fs.copyFileSync(path.join(path.dirname(file), sibling.name), path.join(destinationDir, sibling.name))
  }
}

console.log(`Migrated ${markdownFiles.length} Markdown posts from ${sourceRoot}`)
