import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import sharp from 'sharp'

const blogRoot = path.resolve('src/content/blog')

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : target
  }))
  return files.flat()
}

const markdownFiles = (await walk(blogRoot)).filter((file) => /index\.mdx?$/.test(file))
const pending = []

for (const file of markdownFiles) {
  const raw = await fs.readFile(file, 'utf8')
  const parsed = matter(raw)
  const coverUrl = parsed.data.coverUrl
  if (typeof coverUrl !== 'string') continue

  const response = await fetch(encodeURI(coverUrl))
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${coverUrl}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(buffer).metadata()
  const { dominant } = await sharp(buffer).stats()
  const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format
  if (!extension) throw new Error(`Unknown image format: ${coverUrl}`)

  const color = `#${[dominant.r, dominant.g, dominant.b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
  const imageName = `cover.${extension}`
  const heroImage = [
    'heroImage:',
    `  src: ${JSON.stringify(`./${imageName}`)}`,
    `  alt: ${JSON.stringify(parsed.data.title)}`,
    `  color: ${JSON.stringify(color)}`
  ].join('\n')
  const nextRaw = raw.replace(/^coverUrl:\s*.*$/m, heroImage)

  pending.push({ file, imageName, buffer, nextRaw, width: metadata.width, height: metadata.height, color })
}

for (const item of pending) {
  await fs.writeFile(path.join(path.dirname(item.file), item.imageName), item.buffer)
  await fs.writeFile(item.file, item.nextRaw, 'utf8')
  console.log(`${path.relative(blogRoot, item.file)}: ${item.width}x${item.height}, ${item.color}`)
}

console.log(`Cached ${pending.length} cover images.`)
