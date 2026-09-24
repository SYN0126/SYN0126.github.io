import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import sharp from 'sharp'

const blogRoot = path.resolve('src/content/blog')

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : target
  }))
  return nested.flat()
}

const files = (await walk(blogRoot)).filter((file) => /index\.mdx?$/.test(file))

for (const file of files) {
  const raw = await fs.readFile(file, 'utf8')
  const parsed = matter(raw)
  const hero = parsed.data.heroImage
  if (!hero || typeof hero.src !== 'string' || !/^https?:\/\//.test(hero.src)) continue

  const response = await fetch(encodeURI(hero.src))
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${hero.src}`)
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
  if (!metadata.width || !metadata.height) throw new Error(`Cannot read dimensions: ${hero.src}`)

  parsed.data.heroImage = {
    ...hero,
    inferSize: false,
    width: metadata.width,
    height: metadata.height
  }
  await fs.writeFile(file, matter.stringify(parsed.content, parsed.data), 'utf8')
  console.log(`${path.relative(blogRoot, file)}: ${metadata.width}x${metadata.height}`)
}
