import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { listArticles, createArticle, parseArticle, draftText, replaceFile, splitTags, parseStatus } from '../blog-manager-v2-core.mjs';
import { BlogManager, command, nativeBridge } from '../blog-manager-v2.mjs';

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'glow-manager-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const article = (title = '测试', draft = true) => `---\ntitle: "${title}"\npublishDate: 2026-11-12T12:00:00Z\ndraft: ${draft} # 保留这条注释\n---\n正文\n\`\`\`yaml\ndraft: true\n\`\`\`\n`;
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('草稿创建支持中文、引号、多行简介和标签去重', async t => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'src/content/blog'), { recursive: true });
  const title = '中文 "引号" $() `字符`';
  const file = await createArticle(root, { title, description: '第一行\n第二行: 简介', slug: 'my-post', tags: splitTags('#思考，效率 思考;工具') });
  const parsed = parseArticle(await fs.readFile(file, 'utf8'), file);
  assert.equal(parsed.title, title);
  assert.equal(parsed.draft, true);
  assert.deepEqual(parsed.tags, ['思考', '效率', '工具']);
  await assert.rejects(createArticle(root, { title, slug: 'my-post' }), { code: 'EEXIST' });
  await assert.rejects(createArticle(root, { title, slug: '../escape' }), /短名/);
});

test('文章搜索包含嵌套 MD/MDX，跳过符号链接', async t => {
  const root = await temporary(t);
  const dir = path.join(root, 'src/content/blog');
  await fs.mkdir(path.join(dir, 'nested'), { recursive: true });
  await fs.writeFile(path.join(dir, 'nested', 'test.mdx'), article('中文文章'));
  await fs.writeFile(path.join(dir, 'other.md'), article('其他'));
  await fs.symlink(path.join(dir, 'other.md'), path.join(dir, 'link.md'));
  assert.equal((await listArticles(root)).length, 2);
  assert.equal((await listArticles(root, '中文'))[0].relative, 'nested/test.mdx');
});

test('切换草稿只改头部布尔值，保留注释、正文及换行格式', () => {
  for (const text of [article(), article().replaceAll('\n', '\r\n')]) {
    const updated = draftText(text, false);
    assert.equal(updated, text.replace('draft: true #', 'draft: false #'));
    assert.equal(draftText(updated, true), text);
  }
  const missing = article().replace('draft: true # 保留这条注释\n', '');
  assert.equal(parseArticle(draftText(missing, true), 'test').draft, true);
  assert.throws(() => draftText(article().replace('draft: true #', 'draft: "true" #'), false), /draft/);
});

test('编辑器并发保存时拒绝覆盖，成功写入不留下临时文件', async t => {
  const root = await temporary(t);
  const file = path.join(root, 'article.md');
  const original = article();
  await fs.writeFile(file, original);
  await replaceFile(file, original, draftText(original, false));
  await assert.rejects(replaceFile(file, original, '不可覆盖'), /修改/);
  assert.equal(parseArticle(await fs.readFile(file, 'utf8'), file).draft, false);
  assert.deepEqual(await fs.readdir(root), ['article.md']);
});

test('正确解析含空格、中文和重命名的 Git NUL 状态', () => {
  assert.deepEqual(parseStatus('R  新 文件.md\0旧 文件.md\0?? 中文.txt\0'), [
    { status: 'R ', file: '新 文件.md', oldFile: '旧 文件.md' },
    { status: '??', file: '中文.txt', oldFile: undefined }
  ]);
});

test('原生弹窗桥接保留特殊字符，并区分取消与空说明', () => {
  function evaluate(payload, result, cancel = false) {
    const app = { displayDialog: () => { if (cancel) { const error = new Error('取消'); error.errorNumber = -128; throw error; } return result; }, chooseFromList: () => result };
    return JSON.parse(vm.runInNewContext(`${nativeBridge}\nrun([payload])`, { Application: { currentApplication: () => app }, payload: JSON.stringify(payload) }));
  }
  assert.deepEqual(evaluate({kind:'prompt', message:'中文 $() `"'}, {textReturned:''}), {value:''});
  assert.deepEqual(evaluate({kind:'prompt'}, null, true), {cancelled:true});
  assert.deepEqual(evaluate({kind:'choose'}, false), {cancelled:true});
  assert.deepEqual(evaluate({kind:'choose'}, ['中文选项']), {value:'中文选项'});
});

async function publishFixture(t, { answer = '', failBuild = false, failPush = false, duringPrompt } = {}) {
  const base = await temporary(t);
  const root = path.join(base, '博客 有空格');
  const remote = path.join(base, 'remote.git');
  await fs.mkdir(root);
  git(base, 'init', '--bare', remote);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Local Test');
  git(root, 'config', 'user.email', 'local-test@example.invalid');
  await fs.writeFile(path.join(root, 'post.md'), 'initial\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
  git(root, 'remote', 'add', 'origin', remote); git(root, 'push', '-u', 'origin', 'main');
  const initial = git(root, 'rev-parse', 'HEAD');
  const messages = [], calls = [];
  const ui = { prompt: async () => { if (duringPrompt) await duringPrompt(root); return answer; }, confirm: async () => true, info: async message => messages.push(message) };
  const manager = new BlogManager({ root, ui, execute: async (name, args, options) => {
    calls.push([name, ...args]);
    if (name === 'npm') { if (failBuild) throw new Error('模拟构建失败'); return ''; }
    if (name === 'gh') return '';
    if (name === 'git' && args.includes('push') && failPush) throw new Error('模拟网络失败');
    return command(name, args, { ...options, quiet: true });
  } });
  manager.ensureDependencies = async () => true;
  manager.note = async () => {};
  return { root, remote, initial, manager, calls, messages };
}

test('确认后构建、提交、推送到隔离的本地测试远端', async t => {
  const f = await publishFixture(t, { answer: '测试 "说明" $() `不执行`' });
  await fs.writeFile(path.join(f.root, '中文 文件.md'), 'content');
  await f.manager.publish();
  assert.equal(git(f.root, 'log', '-1', '--format=%s'), '测试 "说明" $() `不执行`');
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), git(f.root, '--git-dir', f.remote, 'rev-parse', 'refs/heads/main'));
  assert(f.messages.some(m => m.includes('并不代表部署已完成')));
  assert(f.calls.findIndex(c => c[0] === 'npm') < f.calls.findIndex(c => c.includes('commit')));
});

test('取消上传不提交、不推送，并保留已有暂存状态', async t => {
  const f = await publishFixture(t, { answer: null });
  await fs.writeFile(path.join(f.root, 'post.md'), 'staged'); git(f.root, 'add', '.');
  const staged = git(f.root, 'diff', '--cached');
  await f.manager.publish();
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.initial);
  assert.equal(git(f.root, 'diff', '--cached'), staged);
  assert(!f.calls.some(c => c.includes('push')));
});

test('构建失败时不创建提交或推送', async t => {
  const f = await publishFixture(t, { failBuild: true });
  await fs.writeFile(path.join(f.root, 'post.md'), 'changed');
  await assert.rejects(f.manager.publish(), /构建失败/);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.initial);
  assert(!f.calls.some(c => c.includes('push') || c.includes('add')));
});

test('推送失败保留提交，再次上传能够重试而不生成重复提交', async t => {
  const f = await publishFixture(t, { failPush: true });
  await fs.writeFile(path.join(f.root, 'post.md'), 'changed');
  await assert.rejects(f.manager.publish(), /本地提交已保留/);
  const commit = git(f.root, 'rev-parse', 'HEAD');
  assert.notEqual(commit, f.initial);
  f.manager.execute = (name, args, options) => name === 'npm' ? Promise.resolve('') : command(name, args, { ...options, quiet: true });
  await f.manager.publish();
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), commit);
  assert.equal(git(f.root, '--git-dir', f.remote, 'rev-parse', 'refs/heads/main'), commit);
});

test('远端领先时停止，不自动合并或强制推送', async t => {
  const f = await publishFixture(t);
  const other = path.join(path.dirname(f.root), 'other');
  git(path.dirname(f.root), 'clone', '--branch', 'main', f.remote, other);
  git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
  await fs.writeFile(path.join(other, 'remote.md'), 'remote');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'remote change'); git(other, 'push', 'origin', 'main');
  await fs.writeFile(path.join(f.root, 'post.md'), 'local');
  await assert.rejects(f.manager.publish(), /本地还没有/);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.initial);
  assert(!f.calls.some(c => c[0] === 'npm' || c.includes('push')));
});

test('弹窗确认期间内容变化时拒绝上传未验证的内容', async t => {
  const f = await publishFixture(t, { duringPrompt: root => fs.writeFile(path.join(root, 'post.md'), 'edited again') });
  await fs.writeFile(path.join(f.root, 'post.md'), 'changed');
  await assert.rejects(f.manager.publish(), /确认期间文件发生变化/);
  assert.equal(git(f.root, 'rev-parse', 'HEAD'), f.initial);
});

test('非 main 分支不能误触本站自动部署', async t => {
  const f = await publishFixture(t);
  git(f.root, 'switch', '-c', 'test-branch');
  await assert.rejects(f.manager.publish(), /当前分支/);
  assert(!f.calls.some(c => c.includes('fetch') || c.includes('push')));
});

test('GitHub HTTPS 未登录时给出明确提示，不进入构建或提交', async t => {
  const f = await publishFixture(t);
  git(f.root, 'remote', 'set-url', 'origin', 'https://github.com/example/test.git');
  f.manager.execute = (name, args, options) => {
    if (name === 'gh') return Promise.reject(new Error('not logged in'));
    if (name !== 'git' || args.includes('fetch') || args.includes('push')) throw new Error('不应执行网络或构建');
    return command(name, args, { ...options, quiet: true });
  };
  await assert.rejects(f.manager.publish(), /gh auth login/);
});
