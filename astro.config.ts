import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import AstroPureIntegration from 'astro-pure'
import { defineConfig, fontProviders, svgoOptimizer } from 'astro/config'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

import rehypeAutolinkHeadings from './src/plugins/rehype-auto-link-headings.ts'
import {
  addCollapse,
  addCopyButton,
  addLanguage,
  addTitle,
  updateStyle
} from './src/plugins/shiki-custom-transformers.ts'
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerRemoveNotationEscape
} from './src/plugins/shiki-official/transformers.ts'
import config from './src/site.config.ts'

export default defineConfig({
  site: 'https://SYN0126.github.io',
  trailingSlash: 'never',
  server: { host: true },
  vite: {
    // astro-pure contains virtual modules provided by its Astro integration.
    // Let Vite transform it normally instead of trying to pre-bundle it in dev.
    optimizeDeps: { exclude: ['astro-pure'] }
  },
  prefetch: { defaultStrategy: 'viewport' },
  image: {
    responsiveStyles: false,
    service: { entrypoint: 'astro/assets/services/noop' },
    remotePatterns: [{ protocol: 'https' }]
  },
  fonts: [
    {
      provider: fontProviders.local() as any,
      name: 'Satoshi',
      cssVariable: '--font-satoshi',
      styles: ['normal'],
      weights: ['100 900'],
      subsets: ['latin'],
      options: {
        variants: [
          {
            src: ['./src/assets/fonts/AlimamaFangYuanTiVF-Thin.ttf'],
            weight: '100 900',
            style: 'normal'
          }
        ]
      }
    }
  ],
  integrations: [AstroPureIntegration(config)],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [
      [rehypeKatex, {}],
      rehypeHeadingIds,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'append',
          properties: { className: ['anchor'] },
          content: { type: 'text', value: '#' }
        }
      ]
    ],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      transformers: [
        transformerNotationDiff(),
        transformerNotationHighlight(),
        transformerRemoveNotationEscape(),
        updateStyle(),
        addTitle(),
        addLanguage(),
        addCopyButton(2000),
        addCollapse(15)
      ]
    }
  },
  experimental: {
    contentIntellisense: true,
    svgOptimizer: svgoOptimizer(),
    clientPrerender: true,
    queuedRendering: { enabled: true }
  }
})
