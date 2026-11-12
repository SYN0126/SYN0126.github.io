// 可独立测试的文章操作；不显示弹窗，不执行 Git 上传。
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';

export const validSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
export const splitTags = value => [...new Set(value.split(/[\s,，;；#]+/u).filter(Boolean))];

export function parseArticle(text, file) {
  if (!/^---\r?\n/.test(text)) throw new Error(`文章缺少 YAML 信息区：${file}`);
  const { data } = matter(text);
  if (typeof data.title !== 'string' || !data.title.trim()) throw new Error(`文章标题为空或格式错误：${file}`);
  if (data.draft !== undefined && typeof data.draft !== 'boolean') throw new Error(`draft 必须是 true 或 false：${file}`);
  return { file, title: data.title, draft: data.draft === true,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    date: Number.isNaN(new Date(data.publishDate).valueOf()) ? 0 : new Date(data.publishDate).valueOf() };
}

export async function listArticles(root, search = '') {
  const base = path.join(root, 'src/content/blog');
  const articles = [];
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      // 不跟随符号链接，文章操作仅限此博客自己的内容目录。
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        const article = parseArticle(await fs.readFile(file, 'utf8'), file);
        article.relative = path.relative(base, file);
        articles.push(article);
      }
    }
  }
  await visit(base);
  const query = search.trim().toLocaleLowerCase();
  return articles.filter(a => `${a.title} ${a.tags.join(' ')} ${a.relative}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => b.date - a.date || a.relative.localeCompare(b.relative));
}

export function draftText(text, draft) {
  parseArticle(text, '当前文章');
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(text);
  if (!match) throw new Error('文章 YAML 信息区没有结束标记。');
  const lines = match[2].match(/^draft\s*:/gm) || [];
  if (lines.length > 1) throw new Error('发现重复的 draft 字段，请先手动修正。');
  const newline = match[1].includes('\r\n') ? '\r\n' : '\n';
  let header = match[2];
  if (lines.length) {
    // 只修改 YAML 中的 draft，保留正文、其他字段和注释。
    const scalar = /^(draft\s*:\s*)(?:true|false)([ \t]*(?:#[^\r\n]*)?)(\r?)$/m;
    if (!scalar.test(header)) throw new Error('draft 格式较特殊，请手动将它改为 true 或 false。');
    header = header.replace(scalar, (_, prefix, suffix, cr) => `${prefix}${draft}${suffix}${cr}`);
  } else header += `${newline}draft: ${draft}`;
  const result = match[1] + header + match[3] + text.slice(match[0].length);
  if (parseArticle(result, '当前文章').draft !== draft) throw new Error('草稿状态验证失败，未写入。');
  return result;
}

export async function replaceFile(file, expected, next) {
  const original = await fs.readFile(file, 'utf8');
  if (original !== expected) throw new Error('文件刚被其他编辑器修改，请重新选择文章后再操作。');
  const info = await fs.lstat(file);
  if (!info.isFile()) throw new Error('只允许修改普通文章文件。');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, next, { flag: 'wx', mode: info.mode & 0o777 });
    if (await fs.readFile(file, 'utf8') !== expected) throw new Error('文件已变化，未覆盖。');
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function createArticle(root, { title, description = '', slug, tags = [] }, now = new Date()) {
  if (!title.trim()) throw new Error('标题不能为空。');
  if (!validSlug(slug)) throw new Error('英文短名只能包含小写字母、数字和连接它们的单个短横线。');
  const folder = path.join(root, 'src/content/blog', slug);
  const file = path.join(folder, 'index.md');
  const body = matter.stringify('\n正文写在这里。\n\n## 第一个小标题\n', {
    title: title.trim(), description, publishDate: now.toISOString(),
    tags: tags.length ? tags : ['未分类'], categories: [], language: 'zh-CN', draft: true, comment: false
  });
  // mkdir 不覆盖已有目录，也不沿同名符号链接写入。
  await fs.mkdir(folder);
  try { await fs.writeFile(file, body, { flag: 'wx' }); }
  catch (error) { await fs.rmdir(folder).catch(() => {}); throw error; }
  return file;
}

export function parseStatus(output) {
  const tokens = output.split('\0');
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i]) continue;
    const status = tokens[i].slice(0, 2);
    const file = tokens[i].slice(3);
    let oldFile;
    if (/[RC]/.test(status)) oldFile = tokens[++i];
    files.push({ status, file, oldFile });
  }
  return files;
}
