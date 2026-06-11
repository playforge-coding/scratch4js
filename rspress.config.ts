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
});
