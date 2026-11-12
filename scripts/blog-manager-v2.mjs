// macOS 弹窗管理入口；不更改原版博客管理.command。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listArticles, createArticle, splitTags, validSlug, draftText, replaceFile, parseStatus } from './blog-manager-v2-core.mjs';

const TITLE = '小龙的炫光版 · 博客管理 2.0';
const SITE = 'https://syn0126.github.io/';
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeBridge = `function run(argv) {
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  var p = JSON.parse(argv[0]);
  try {
    var value;
    if (p.kind === 'choose') {
      var picked = app.chooseFromList(p.items, {withTitle:p.title, withPrompt:p.message, okButtonName:'选择', cancelButtonName:'返回', multipleSelectionsAllowed:false, emptySelectionAllowed:false});
      return JSON.stringify(picked === false ? {cancelled:true} : {value:picked[0]});
    }
    var opts = {withTitle:p.title, buttons:p.buttons || ['好'], defaultButton:p.defaultButton || (p.buttons || ['好']).slice(-1)[0]};
    if (p.cancelButton) opts.cancelButton = p.cancelButton;
    if (p.timeout) opts.givingUpAfter = p.timeout;
    if (p.kind === 'prompt') opts.defaultAnswer = p.value || '';
    var result = app.displayDialog(p.message, opts);
    if (result.gaveUp) return JSON.stringify({cancelled:true});
    value = p.kind === 'prompt' ? result.textReturned : result.buttonReturned;
    return JSON.stringify({value:value});
  } catch (e) {
    if (e.errorNumber === -128 || /cancel|取消/i.test(String(e))) return JSON.stringify({cancelled:true});
    throw e;
  }
}`;

export async function command(commandName, args, { cwd = defaultRoot, quiet = false, log = () => {}, onChild = () => {}, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { cwd, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ...env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    onChild(child);
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; if (!quiet) { process.stdout.write(data); log(data); } });
    child.stderr.on('data', data => { stderr += data; if (!quiet) { process.stderr.write(data); log(data); } });
    child.on('error', reject);
    child.on('close', code => {
      onChild(null);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${commandName} 执行失败（退出码 ${code}）\n${stderr.trim().slice(-3500) || stdout.trim().slice(-3500)}`));
    });
  });
}

export class NativeUI {
  child = null;
  async call(kind, message, options = {}) {
    const output = await command('/usr/bin/osascript', ['-l', 'JavaScript', '-e', nativeBridge, JSON.stringify({ kind, title: TITLE, message, ...options })], { quiet: true, onChild: child => { this.child = child; } });
    const result = JSON.parse(output.trim());
    return result.cancelled ? null : result.value;
  }
  choose(message, items) { return this.call('choose', message, { items }); }
  prompt(message, value = '', button = '继续') { return this.call('prompt', message, { value, buttons: ['取消', button], cancelButton: '取消' }); }
  info(message) { return this.call('info', message); }
  async confirm(message, button = '确定') {
    return (await this.call('info', message, { buttons: ['取消', button], cancelButton: '取消' })) === button;
  }
}

export class BlogManager {
  constructor({ root = defaultRoot, ui = new NativeUI(), execute = command, log = () => {}, logPath = '' } = {}) {
    this.root = root;
    this.ui = ui;
    this.execute = execute;
    this.log = log;
    this.logPath = logPath;
    this.preview = null;
    this.activeChild = null;
    this.credentialArgs = [];
  }
  async run(name, args, quiet = false) {
    return this.execute(name, args, { cwd: this.root, quiet, log: this.log, onChild: child => { this.activeChild = child; } });
  }
  git(args, quiet = true) { return this.run('git', args, quiet); }
  async note(text) { console.log(`\n${text}\n`); this.log(text + '\n'); }
  async open(target, editor = false) {
    if (editor) {
      try { await this.run('/usr/bin/open', ['-a', 'TextEdit', target], true); return; } catch {}
    }
    await this.run('/usr/bin/open', [target], true);
  }
  async repo() {
    const actual = (await this.git(['rev-parse', '--show-toplevel'])).trim();
    if (await fs.realpath(actual) !== await fs.realpath(this.root)) throw new Error('当前博客没有自己的独立 Git 仓库，已停止，避免提交父目录里的其他项目。');
    const branch = (await this.git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim();
    const remote = (await this.git(['remote', 'get-url', 'origin'])).trim();
    return { branch, remote };
  }
  async changes() { return parseStatus(await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])); }
  async fingerprint() {
    const hash = createHash('sha256');
    hash.update(await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    hash.update(await this.git(['diff', '--binary', 'HEAD', '--']));
    for (const entry of await this.changes()) {
      if (entry.status !== '??') continue;
      const file = path.join(this.root, entry.file);
      const stat = await fs.lstat(file);
      hash.update(entry.file);
      hash.update(stat.isSymbolicLink() ? await fs.readlink(file) : await fs.readFile(file));
    }
    return hash.digest('hex');
  }
  async health() {
    const { branch, remote } = await this.repo();
    const files = await this.changes();
    return `分支：${branch}\n远端：${remote}\n${files.length} 个文件有未提交改动\n本地预览：${this.preview ? this.preview.url : '未启动'}`;
  }
  async newArticle() {
    const title = await this.ui.prompt('文章标题（必填）。新文章默认是草稿。');
    if (title === null) return;
    if (!title.trim()) throw new Error('标题不能为空。');
    const description = await this.ui.prompt('一句话简介（可留空）');
    if (description === null) return;
    let slug = `post-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
    for (;;) {
      slug = await this.ui.prompt('英文短名：小写字母、数字和短横线，例如 my-first-post。它决定文章网址。', slug);
      if (slug === null) return;
      slug = slug.trim().toLowerCase();
      if (validSlug(slug)) {
        try { await fs.lstat(path.join(this.root, 'src/content/blog', slug)); }
        catch (error) { if (error.code === 'ENOENT') break; throw error; }
        await this.ui.info('这个短名已经存在，请换一个。');
      } else await this.ui.info('格式示例：my-first-post。不能包含空格、中文或路径斜杠。');
    }
    const tags = await this.ui.prompt('标签（可选），用空格、逗号或 # 分隔，例如：#思考 #效率');
    if (tags === null) return;
    const file = await createArticle(this.root, { title, description, slug, tags: splitTags(tags) });
    await this.open(file, true);
    await this.ui.info('草稿已创建并打开。\n\n保存文章后，在“查找 / 管理文章”中设为已发布，再执行“上传 GitHub”。');
  }
  async manageArticle() {
    const query = await this.ui.prompt('按标题、标签或文章路径搜索；留空显示全部。');
    if (query === null) return;
    const articles = await listArticles(this.root, query);
    if (!articles.length) { await this.ui.info('没有找到匹配的文章。'); return; }
    const labels = articles.map((a, i) => `${i + 1}. [${a.draft ? '草稿' : '已发布'}] ${a.title}  ·  ${a.relative}`);
    const chosen = await this.ui.choose(`共 ${articles.length} 篇，按发布日期从新到旧排列。`, labels);
    if (chosen === null) return;
    const article = articles[labels.indexOf(chosen)];
    const action = await this.ui.choose(`${article.title}\n标签：${article.tags.join('、') || '未分类'}\n${article.relative}`, ['编辑文章', '打开文章所在文件夹', article.draft ? '设为已发布' : '隐藏为草稿', '移到废纸篓']);
    if (action === null) return;
    if (action === '编辑文章') return this.open(article.file, true);
    if (action === '打开文章所在文件夹') return this.open(path.dirname(article.file));
    if (action === '移到废纸篓') {
      // index.md(x) 为独立文章目录时，将配图一并交给 Finder 移到废纸篓。
      const parent = path.dirname(article.file);
      const base = path.join(this.root, 'src/content/blog');
      const siblings = await fs.readdir(parent);
      const independent = /^index\.mdx?$/.test(path.basename(article.file)) && parent !== base && !siblings.some(name => /\.mdx?$/.test(name) && name !== path.basename(article.file));
      const target = independent ? parent : article.file;
      const warning = independent ? '该文章目录及其中的配图' : '该文章文件（其他文件保留）';
      if (!await this.ui.confirm(`把“${article.title}”移到废纸篓？\n\n将移动${warning}。上传并部署后，线上文章才会移除。`, '移到废纸篓')) return;
      await this.run('/usr/bin/osascript', ['-e', 'on run argv\n tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)\nend run', target], true);
      await this.ui.info('已移到废纸篓，可从 Finder 恢复。尚未上传。');
      return;
    }
    if (!await this.ui.confirm(`将“${article.title}”${article.draft ? '设为已发布' : '隐藏为草稿'}？\n\n这一步只修改本地，上传并部署后才影响线上。`, '修改状态')) return;
    const before = await fs.readFile(article.file, 'utf8');
    // 重新验证状态，避免弹窗期间编辑器改动被误覆盖。
    const current = (await listArticles(this.root)).find(a => a.file === article.file);
    if (!current || current.draft !== article.draft) throw new Error('文章状态已变化，请重新选择。');
    await replaceFile(article.file, before, draftText(before, !article.draft));
    await this.ui.info(`已${article.draft ? '设为已发布' : '隐藏为草稿'}。需要更新线上时，再选择“上传 GitHub”。`);
  }
  async ensureDependencies() {
    try { await fs.access(path.join(this.root, 'node_modules/.bin/astro')); }
    catch {
      if (!await this.ui.confirm('缺少博客构建依赖。是否按照 package-lock.json 安装？进度会显示在终端。', '安装依赖')) return false;
      await this.run('npm', ['ci', '--no-audit', '--no-fund']);
    }
    return true;
  }
  async build() {
    if (!await this.ensureDependencies()) return false;
    await this.note('正在检查并构建博客，请查看终端进度…');
    await this.run('npm', ['run', 'build']);
    return true;
  }
  async publish() {
    const { branch, remote } = await this.repo();
    if (branch !== 'main') throw new Error(`当前分支是 ${branch}。本站的自动部署监听 main，请先切回 main；2.0 不会自动切换分支。`);
    const files = await this.changes();
    if (files.some(f => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(f.status))) throw new Error('存在尚未解决的 Git 合并冲突，请先解决后再上传。');
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
      const markerPath = (await this.git(['rev-parse', '--git-path', marker])).trim();
      try { await fs.access(path.resolve(this.root, markerPath)); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw new Error('Git 正在合并、变基或应用提交，请先完成或取消该操作。');
    }
    this.credentialArgs = [];
    if (/^https:\/\/github\.com\//i.test(remote)) {
      await this.run('gh', ['auth', 'status'], true).catch(() => { throw new Error('GitHub CLI 尚未登录。请在终端执行 gh auth login，再重新上传。'); });
      this.credentialArgs = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
    }
    await this.note('正在核对 GitHub 上的最新版本…');
    await this.git([...this.credentialArgs, 'fetch', 'origin', `refs/heads/${branch}`], false);
    const [ahead, behind] = (await this.git(['rev-list', '--left-right', '--count', 'HEAD...FETCH_HEAD'])).trim().split(/\s+/).map(Number);
    if (behind) throw new Error(`GitHub 上有 ${behind} 个本地还没有的提交。请先同步并解决可能的冲突，再重新上传。没有创建新提交，也没有强制推送。`);
    if (!files.length && !ahead) { await this.ui.info('本地提交已与 GitHub 同步，没有需要上传的内容。'); return; }
    const beforeBuild = await this.fingerprint();
    if (!await this.build()) return;
    if (await this.fingerprint() !== beforeBuild) throw new Error('构建期间源文件发生了变化。请保存编辑器后重新上传，以确保上传内容已经通过构建。');
    const summary = files.slice(0, 22).map(f => `${f.status} ${f.file}`).join('\n');
    const details = `仓库：${remote}\n分支：${branch}\n未提交文件：${files.length} 个；待推送提交：${ahead} 个\n\n${summary}${files.length > 22 ? '\n…其余改动可在终端查看' : ''}`;
    await this.note(details);
    if (files.length) {
      const message = await this.ui.prompt(`构建已通过。将提交本博客内全部未忽略的改动，并上传 GitHub。\n${details}\n\n这次修改了什么？留空使用当前时间；取消不会提交或推送。`, '', '上传');
      if (message === null) return;
      if (await this.fingerprint() !== beforeBuild) throw new Error('确认期间文件发生变化，请保存编辑器后重新上传。');
      const commitMessage = message.trim() || `更新炫光版博客 ${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul', hour12: false })}`;
      await this.git(['add', '--all', '--', '.'], false);
      await this.git(['commit', '-m', commitMessage], false);
    } else if (!await this.ui.confirm(`构建已通过。上传之前保存在本地的提交？\n\n${details}`, '上传')) return;
    try {
      await this.git([...this.credentialArgs, 'push', '--set-upstream', 'origin', branch], false);
    } catch (error) {
      throw new Error(`推送未完成。本地提交已保留；修复网络或同步问题后，再选“上传 GitHub”即可重试。\n\n${error.message}`);
    }
    await this.ui.info('代码已上传到 GitHub。\n\nGitHub Pages 接下来会自动构建和部署，通常需要稍等。上传成功并不代表部署已完成，可在仓库 Actions 中查看结果。');
  }
  async startPreview() {
    if (this.preview && (this.preview.child.exitCode !== null || this.preview.child.signalCode !== null)) await this.stopPreview();
    if (this.preview) { await this.open(this.preview.url); return; }
    if (!await this.ensureDependencies()) return;
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port)], { cwd: this.root, detached: true, env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError = null;
    child.on('error', error => { spawnError = error; });
    const url = `http://127.0.0.1:${port}/`;
    this.preview = { child, url };
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { process.stdout.write(data); this.log(data); });
    await this.note('正在启动本地预览，首次加载可能需要一些时间…');
    try {
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null) throw new Error('预览进程提前退出，请查看终端或日志。');
        try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.ok) { ready = true; break; } }
        catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!ready) throw new Error('预览启动超时，请查看终端日志中的错误。');
      await this.open(url);
      await this.ui.info(`本地预览已打开：\n${url}\n\n本地预览包含草稿。可以回到菜单继续管理文章；“停止本地预览”或退出管理器会关闭这次预览。`);
    } catch (error) { await this.stopPreview(); throw error; }
  }
  async stopChild(child) {
    if (!child || !child.pid) return;
    // 只结束本管理器创建的进程组，包括 npm 下的 Astro 子进程。
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await new Promise(resolve => setTimeout(resolve, 400));
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  async stopPreview() {
    if (!this.preview) return;
    const preview = this.preview;
    this.preview = null;
    await this.stopChild(preview.child);
  }
  async cleanup() { await this.stopPreview(); await this.stopChild(this.activeChild); await this.stopChild(this.ui.child); }
  async menu() {
    const items = ['新建草稿', '查找 / 管理文章', '编辑“关于”页', '启动 / 打开本地预览', '停止本地预览', '检查 / 构建网站', '上传 GitHub', '查看 Git 改动', '查看 GitHub 部署进度', '打开线上博客', '打开项目文件夹', '使用帮助 / 日志', '退出'];
    for (;;) {
      let health;
      try { health = await this.health(); } catch { health = 'Git 配置待检查；本地文章管理仍然可用。'; }
      const choice = await this.ui.choose(`${health}\n\n选择操作；此处按“返回”也可退出。`, items);
      if (choice === null || choice === '退出') return;
      try {
        if (choice === items[0]) await this.newArticle();
        else if (choice === items[1]) await this.manageArticle();
        else if (choice === items[2]) await this.open(path.join(this.root, 'src/content/about.md'), true);
        else if (choice === items[3]) await this.startPreview();
        else if (choice === items[4]) { await this.stopPreview(); await this.ui.info('本管理器启动的预览已停止。'); }
        else if (choice === items[5]) { if (await this.build()) await this.ui.info('检查和构建已通过，产物在 dist 文件夹。本操作没有上传 GitHub。'); }
        else if (choice === items[6]) await this.publish();
        else if (choice === items[7]) {
          const files = await this.changes();
          await this.note(files.map(f => `${f.status} ${f.file}`).join('\n') || '工作区没有未提交改动。');
          await this.ui.info(`${await this.health()}\n\n${files.slice(0, 22).map(f => `${f.status} ${f.file}`).join('\n') || '工作区没有未提交改动。'}\n\n完整列表已显示在终端。`);
        }
        else if (choice === items[8]) {
          const { remote } = await this.repo();
          const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote);
          if (!match) throw new Error('当前远端不是可识别的 GitHub 地址。');
          await this.open(`https://github.com/${match[1]}/actions`);
        }
        else if (choice === items[9]) await this.open(SITE);
        else if (choice === items[10]) await this.open(this.root);
        else if (choice === items[11]) {
          const action = await this.ui.choose('推荐流程：新建草稿 → 编辑保存 → 本地预览 → 设为已发布 → 上传 GitHub。\n\n上传前自动构建，填写说明可留空，失败后保留本地提交。\n原版博客管理.command 保留可用。\n退出会停止本管理器创建的预览。', ['打开 2.0 使用说明', '打开本次运行日志']);
          if (action === '打开 2.0 使用说明') await this.open(path.join(this.root, '博客管理2.0说明.md'), true);
          if (action === '打开本次运行日志' && this.logPath) await this.open(this.logPath, true);
        }
      } catch (error) {
        await this.note(error.stack || error.message);
        await this.ui.info(`操作未完成：\n${error.message.slice(0, 3200)}\n\n已保留现有内容，详细记录请看终端或“使用帮助 / 日志”。`);
      }
    }
  }
}

async function main() {
  const ui = new NativeUI();
  const root = await fs.realpath(defaultRoot);
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const cache = path.join(os.homedir(), 'Library/Caches/GlowBlogManager');
  const lock = path.join(cache, `${key}.lock`);
  await fs.mkdir(cache, { recursive: true });
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid;
    try { pid = Number(await fs.readFile(path.join(lock, 'pid'), 'utf8')); } catch {}
    if (!Number.isInteger(pid) || pid <= 0) { await ui.info('另一个管理器正在启动，请稍后重试。'); return; }
    try { process.kill(pid, 0); await ui.info('这个博客的管理器 2.0 已经打开，请回到原来的弹窗操作。'); return; }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    await fs.rm(lock, { recursive: true });
    await fs.mkdir(lock);
  }
  await fs.writeFile(path.join(lock, 'pid'), String(process.pid));
  const logDir = path.join(os.homedir(), 'Library/Logs/GlowBlogManager');
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.log`);
  const handle = await fs.open(logPath, 'a', 0o600);
  let logQueue = Promise.resolve();
  const manager = new BlogManager({ root, ui, logPath, log: data => { logQueue = logQueue.then(() => handle.write(String(data))).catch(() => {}); } });
  console.log(`${TITLE}\n操作请看 macOS 弹窗；构建和上传进度显示在本终端。\n日志：${logPath}\n`);
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    await manager.cleanup();
    await fs.rm(lock, { recursive: true, force: true });
    await logQueue;
    await handle.close();
  }
  const onSignal = () => { close().finally(() => process.exit(0)); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try { await manager.menu(); }
  finally { await close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(async error => {
    console.error(error);
    try { await new NativeUI().info(`管理器无法启动：${error.message}\n请查看终端。`); } catch {}
    process.exitCode = 1;
  });
}
