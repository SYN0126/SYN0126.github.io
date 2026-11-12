# 小龙的博客 · 炫光版

这是参考 `Dendrobium123/Dendrobium123.github.io` 当前 Astro Pure 站点制作的独立版本，保留同款 WebGL2 动态炫光背景、毛玻璃卡片、暗色模式和移动端性能降级。

## 博客管理工具

macOS 推荐双击 **`博客管理2.0.command`**，使用原生弹窗新建/搜索文章、切换草稿、
管理本地预览，以及填写说明并上传 GitHub。构建和上传进度显示在终端。
具体流程见 [博客管理2.0说明.md](./博客管理2.0说明.md)。原版入口完整保留。

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

目前“炫光版”已经有自己的 Git 仓库，`origin` 为 `SYN0126/SYN0126.github.io`。
上传 `main` 分支会触发现有的 GitHub Pages 工作流；代码上传后还需要等待 Actions 部署完成。
2.0 会先构建、再弹窗确认提交说明；不会自动提交到另外两个博客目录。

## 来源与许可

- 页面结构与定制样式：<https://github.com/Dendrobium123/Dendrobium123.github.io>
- Astro Pure：<https://github.com/cworld1/astro-theme-pure>
- 背景着色器改编自 Benoit Marini 的 Shadertoy 作品，源码注释中的 CC BY-NC-SA 3.0 许可和页面署名已保留。
