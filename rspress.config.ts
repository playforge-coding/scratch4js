import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: 'docs',
  // Served from https://playforge-coding.github.io/scratch4js/ on GitHub Pages.
  base: '/scratch4js/',
  title: 'scratch4js',
  description:
    'Read and edit Scratch .sb3 projects with a small, declarative JavaScript API.',
  lang: 'en',
  llms: true,
  icon: '/favicon.svg',
  logo: '/favicon.svg',
  logoText: 'scratch4js',
  themeConfig: {
    outline: true,
    lastUpdated: true,
    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'API', link: '/api/overview', activeMatch: '/api/' },
      { text: 'MCP server', link: '/guide/mcp-server' },
    ],
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/playforge-coding/scratch4js',
      },
    ],
    footer: {
      message: 'Released under the MPL-2.0 License.',
    },
  },
});
