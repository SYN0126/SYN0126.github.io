import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src/content/blog/', import.meta.url))
const changed = []

async function walk(directory) {
  for (const name of await readdir(directory)) {
    const path = join(directory, name)
    const info = await stat(path)
    if (info.isDirectory()) {
      await walk(path)
      continue
    }
    if (!/\.mdx?$/.test(name)) continue

    const source = await readFile(path, 'utf8')
    const output = source.replace(
      /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/g,
      (_, alt, src) => `<img src="${src}" alt="${alt.replaceAll('"', '&quot;')}" />`
    )
    if (output !== source) {
      await writeFile(path, output)
      changed.push(path)
    }
  }
}

await walk(root)
console.log(`Normalized ${changed.length} Markdown file(s).`)
