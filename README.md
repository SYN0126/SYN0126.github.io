# 小龙的博客 · 炫光版

这是参考 `Dendrobium123/Dendrobium123.github.io` 当前 Astro Pure 站点制作的独立版本，保留同款 WebGL2 动态炫光背景、毛玻璃卡片、暗色模式和移动端性能降级。

## 博客管理工具

macOS 双击 `博客管理.command`，Windows 双击 `博客管理.cmd`（也保留了 `博客管理-Windows.bat`）。管理菜单支持：

- 新建、查看和编辑文章
- 编辑“关于”页
- 在草稿与已发布状态之间切换
- 将文章及其文章目录移入废纸篓/回收站
- 本地预览炫光网站
- 检查并构建静态网站
- 配置独立 Git 仓库后提交并推送到 GitHub

文章管理器会直接操作本文件夹内的 `src/content/blog/`，不会读取或修改另外两个博客文件夹。

## 本地预览

Mac 可以双击 `启动炫光版.command`，也可以在终端运行：

```bash
npm install
npm run dev
```

浏览器打开 <http://localhost:4321>。

## 构建

```bash
npm run build
```

构建结果在 `dist/`。

## 写文章

每篇文章放在 `src/content/blog/英文短名/index.md`。图片可以继续统一放在 `public/images/`，Markdown 中用 `/images/文件名` 引用。

文章头部示例：

```yaml
---
title: "文章标题"
description: "一句话简介"
publishDate: 2026-09-24T12:00:00+09:00
tags: ["未分类"]
draft: false
---
```

## 独立性

这个文件夹是一套完整、独立的网站：源码、文章、图片、依赖和构建结果都在“炫光版”内部。运行时不读取 `blog精简版` 或 `blog主题版`，删除或移动另外两个版本也不会影响它。

目前“炫光版”没有复制或连接原博客的 `.git` 仓库，这是为了避免误操作时覆盖线上版本。管理器的“构建网站 / 发布到 GitHub”会正常完成本地构建；只有以后为“炫光版”单独配置 Git 仓库和 `origin` 后，才会执行提交与推送。

## 来源与许可

- 页面结构与定制样式：<https://github.com/Dendrobium123/Dendrobium123.github.io>
- Astro Pure：<https://github.com/cworld1/astro-theme-pure>
- 背景着色器改编自 Benoit Marini 的 Shadertoy 作品，源码注释中的 CC BY-NC-SA 3.0 许可和页面署名已保留。
