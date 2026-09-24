import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const apply = process.argv.includes('--apply')
const projectRoot = path.resolve('.')
const blogRoot = path.join(projectRoot, 'src/content/blog')
const legacyRoot = path.join(projectRoot, 'legacy-hugo/content')

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : target
  }))
  return nested.flat()
}

const markdownFiles = (await walk(blogRoot)).filter((file) => /index\.mdx?$/.test(file))
const plans = []

for (const file of markdownFiles) {
  const raw = await fs.readFile(file, 'utf8')
  const parsed = matter(raw)
  if (!parsed.data.heroImage) continue

  const originalPath = parsed.data.originalPath
  if (typeof originalPath !== 'string') throw new Error(`Missing originalPath: ${file}`)
  const legacyFile = path.resolve(legacyRoot, originalPath)
  if (!legacyFile.startsWith(`${legacyRoot}${path.sep}`)) throw new Error(`Unsafe path: ${legacyFile}`)

  const legacy = matter(await fs.readFile(legacyFile, 'utf8'))
  const originalImage = legacy.data.image
  if (typeof originalImage !== 'string' || !/^https?:\/\//.test(originalImage)) {
    throw new Error(`Missing remote image URL in ${legacyFile}`)
  }

  const remoteUrl = originalImage.replace(/^http:/, 'https:')
  const color = parsed.data.heroImage.color
  parsed.data.heroImage = {
    src: remoteUrl,
    alt: parsed.data.heroImage.alt || parsed.data.title,
    inferSize: true,
    ...(color ? { color } : {})
  }

  const localCovers = (await fs.readdir(path.dirname(file)))
    .filter((name) => /^cover\.(avif|gif|jpe?g|png|webp)$/i.test(name))
    .map((name) => path.join(path.dirname(file), name))

  plans.push({ file, next: matter.stringify(parsed.content, parsed.data), remoteUrl, localCovers })
}

for (const plan of plans) {
  console.log(`${path.relative(blogRoot, plan.file)} -> ${plan.remoteUrl}`)
}

if (apply) {
  for (const plan of plans) {
    await fs.writeFile(plan.file, plan.next, 'utf8')
    for (const cover of plan.localCovers) {
      if (!cover.startsWith(`${blogRoot}${path.sep}`)) throw new Error(`Unsafe delete: ${cover}`)
      await fs.unlink(cover)
    }
  }
  console.log(`Updated ${plans.length} posts and removed local cover files.`)
} else {
  console.log(`Dry run: ${plans.length} posts can be restored. Use --apply to write changes.`)
}
