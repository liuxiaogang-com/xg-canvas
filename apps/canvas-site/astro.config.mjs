import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://canvas.liuxiaogang.com',
  output: 'static',
  integrations: [
    starlight({
      title: 'XG Canvas 文档',
      description: 'XG Canvas（西瓜画布）的安装、配置、使用与扩展文档。',
      favicon: '/favicon.svg',
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/liuxiaogang-com/xg-canvas',
        },
      ],
      sidebar: [
        { label: '文档首页', link: '/docs/' },
        {
          label: '开始使用',
          items: [{ autogenerate: { directory: 'docs/getting-started' } }],
        },
        {
          label: '使用指南',
          items: [{ autogenerate: { directory: 'docs/user-guide' } }],
        },
        {
          label: '管理与部署',
          items: [{ autogenerate: { directory: 'docs/admin' } }],
        },
        {
          label: '扩展开发',
          items: [{ autogenerate: { directory: 'docs/developer' } }],
        },
        {
          label: '参考',
          items: [{ autogenerate: { directory: 'docs/reference' } }],
        },
      ],
      customCss: ['./src/styles/starlight.css'],
      lastUpdated: true,
      pagefind: true,
    }),
  ],
});
