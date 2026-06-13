import { defineConfig } from '@rspress/core';
import { pluginSitemap } from '@rspress/plugin-sitemap';

export default defineConfig({
  root: 'docs',
  // Served from https://playforge-coding.github.io/scratch4js/ on GitHub Pages.
  base: '/scratch4js/',
  title: 'scratch4js',
  description:
    'A JavaScript toolkit for Scratch & TurboWarp: read and edit .sb3 projects, talk to the Scratch website, drive it from an AI agent, and build & bundle TurboWarp extensions.',
  lang: 'en',
  llms: true,
  icon: '/favicon.svg',
  logo: '/favicon.svg',
  logoText: 'scratch4js',
  themeConfig: {
    // Nav lives in docs/_nav.json and the sidebar is auto-generated from the
    // _meta.json files. Defining `nav` or `sidebar` here would disable that
    // file-based auto-generation, so keep both out of the config.
    outline: true,
    lastUpdated: true,
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
  plugins: [
    pluginSitemap({
      siteUrl: 'https://playforge-coding.github.io/scratch4js',
    }),
  ],
});
