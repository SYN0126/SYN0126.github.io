import type { Config, IntegrationUserConfig, ThemeUserConfig } from 'astro-pure/types'

export const theme: ThemeUserConfig = {
  title: '小龙的博客',
  author: '小龙',
  description: '记录思考，分享观点。',
  favicon: '/favicon.ico',
  socialCard: '/avatar.jpg',
  logo: { src: '/src/assets/avatar.jpg', alt: '小龙' },
  locale: {
    lang: 'zh-CN',
    attrs: 'zh_CN',
    dateLocale: 'en-US',
    dateOptions: { year: 'numeric', month: 'short', day: 'numeric' }
  },
  titleDelimiter: '•',
  prerender: true,
  npmCDN: 'https://cdn.jsdelivr.net/npm',
  head: [],
  customCss: [],
  header: {
    menu: [
      { title: '首页', link: '/' },
      { title: '文章', link: '/blog' },
      { title: '归档', link: '/archives' },
      { title: '友链', link: '/links' },
      { title: '关于', link: '/about' }
    ]
  },
  footer: {
    year: `© 2026 - ${new Date().getFullYear()}`,
    links: [],
    credits: true,
    social: [
      { icon: 'github', label: 'GitHub', href: 'https://github.com/SYN0126' },
      { icon: 'rss', label: 'RSS', href: '/rss.xml' }
    ]
  },
  content: {
    externalLinks: { content: ' ↗', properties: { rel: 'noreferrer' } },
    blogPageSize: 10,
    share: [],
    imageCaption: true
  }
}

export const integ: IntegrationUserConfig = {
  links: { logbook: [], applyTip: [], cacheAvatar: true },
  pagefind: true,
  quote: {
    server: 'data:application/json,%22The%20world%20open%20itself%20before%20those%20with%20noble%20hearts.%22',
    target: '(data) => data'
  },
  typography: {
    class: 'prose text-base',
    blockquoteStyle: 'normal',
    inlineCodeBlockStyle: 'modern'
  },
  mediumZoom: {
    enable: true,
    selector: '.prose .zoomable',
    options: { className: 'zoomable' }
  },
  waline: {
    enable: false,
    server: '',
    showMeta: false,
    emoji: ['bmoji', 'weibo'],
    additionalConfigs: {
      pageview: true,
      comment: true,
      locale: { placeholder: '随便讲点什么~' },
      imageUploader: false
    }
  }
}

export default { ...theme, integ } as Config
