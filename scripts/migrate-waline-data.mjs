import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [sourceArg, outputArg] = process.argv.slice(2)

if (!sourceArg || !outputArg) {
  console.error('Usage: node scripts/migrate-waline-data.mjs <source.json> <output.json>')
  process.exit(1)
}

const pathMap = new Map([
  ['/posts/blog-decoration', '/blog/blog-decoration'],
  ['/blog/博客装修', '/blog/blog-decoration'],
  ['/posts/blog-images-broken', '/blog/blog-images-broken'],
  ['/blog/突然打开blog发现图片全部崩坏', '/blog/blog-images-broken'],
  ['/posts/hello-world', '/blog/hello-world'],
  ['/posts/perception-of-time', '/blog/perception-of-time'],
  ['/blog/时间的感知', '/blog/perception-of-time'],
  ['/posts/prenet-module-improvement', '/blog/prenet-module-improvement'],
  ['/blog/prenet渐近递归网络模块改进', '/blog/prenet-module-improvement'],
  ['/posts/pytorch_note_0', '/blog/pytorch_note_0'],
  ['/blog/2025616随笔', '/blog/thoughts-2025-06-16'],
  ['/blog/电子学paul-horowitz读书笔记', '/blog/art-of-electronics-notes'],
  ['/blog/关于美', '/blog/thoughts-on-beauty'],
  ['/blog/互联网核与童年', '/blog/internetcore-and-childhood'],
  ['/blog/回忆录', '/blog/memoir-archived'],
  ['/blog/回忆录-2', '/blog/morning-flowers-picked-at-dusk'],
  ['/blog/回忆最初的感动', '/blog/remembering-first-emotions'],
  ['/blog/火焰战士', '/blog/flame-warrior'],
  ['/blog/加缪笔记', '/blog/camus-notes'],
  ['/blog/控制论norbert-wiener', '/blog/cybernetics-norbert-wiener'],
  ['/blog/魔女的夜宴', '/blog/sanoba-witch-review'],
  ['/blog/突然的想法', '/blog/sudden-thoughts'],
  ['/blog/摘抄', '/blog/myth-of-sisyphus-excerpts'],
  ['/blog/直视骄阳书后问题', '/blog/staring-at-the-sun-questions'],
  ['/blog/中科大研一想法', '/blog/ustc-first-year-thoughts']
])

const sourcePath = resolve(sourceArg)
const outputPath = resolve(outputArg)
const backup = JSON.parse(await readFile(sourcePath, 'utf8'))

if (backup.type !== 'waline' || !backup.data || !Array.isArray(backup.data.Comment)) {
  throw new Error('The source file is not a supported Waline JSON export.')
}

function remapPath(url) {
  let normalizedPath
  try {
    normalizedPath = decodeURI(url).replace(/\/+$/, '') || '/'
  } catch {
    throw new Error(`Invalid URL encoding: ${url}`)
  }

  const target = pathMap.get(normalizedPath)
  if (target) return target
  if (normalizedPath.startsWith('/posts/')) {
    throw new Error(`Unmapped legacy article URL: ${url}`)
  }
  return normalizedPath
}

let changedComments = 0
for (const comment of backup.data.Comment) {
  const target = remapPath(comment.url)
  if (target !== comment.url) changedComments += 1
  comment.url = target
}

let changedCounters = 0
for (const counter of backup.data.Counter ?? []) {
  const target = remapPath(counter.url)
  if (target !== counter.url) changedCounters += 1
  counter.url = target
}

let fixedAvatars = 0
for (const user of backup.data.Users ?? []) {
  if (user.avatar === 'https://www.dendrobiumcgk.chat/') {
    user.avatar = '/avatar.jpg'
    fixedAvatars += 1
  } else if (typeof user.avatar === 'string' && user.avatar.startsWith('http://')) {
    user.avatar = user.avatar.replace(/^http:\/\//, 'https://')
    fixedAvatars += 1
  }
}

await writeFile(outputPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8')
console.log(`Updated ${changedComments} comment paths.`)
console.log(`Updated ${changedCounters} pageview counter paths.`)
console.log(`Fixed ${fixedAvatars} Waline avatar URLs.`)
console.log(`Output: ${outputPath}`)
