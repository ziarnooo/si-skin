// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';

// SITE_URL / BASE_PATH pozwalają przenieść stronę z GitHub Pages na własną domenę
// bez zmian w kodzie, np. SITE_URL=https://www.si-skin.pl BASE_PATH=/
const site = process.env.SITE_URL ?? 'https://ziarnooo.github.io';
const base = process.env.BASE_PATH ?? '/si-skin';
const basePrefix = base.replace(/\/+$/, '');

/**
 * Linki i obrazki w Markdownie zapisujemy jako `/epilacja-shr/` (bez prefiksu).
 * Ta wtyczka (hast, Sätteri) dokleja do nich `base`, więc te same treści działają
 * zarówno pod /si-skin/, jak i na własnej domenie (base = /).
 */
const baseLinksPlugin = {
  name: 'si-base-links',
  element: {
    filter: ['a', 'img'],
    /** @param {any} node @param {any} ctx */
    visit(node, ctx) {
      if (!basePrefix) return;
      const attr = node.tagName === 'a' ? 'href' : 'src';
      const value = node.properties?.[attr];
      if (
        typeof value === 'string' &&
        value.startsWith('/') &&
        !value.startsWith('//') &&
        value !== basePrefix &&
        !value.startsWith(`${basePrefix}/`)
      ) {
        ctx.setProperty(node, attr, `${basePrefix}${value}`);
      }
    },
  },
};

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  image: { responsiveStyles: true },
  markdown: { processor: satteri({ hastPlugins: [baseLinksPlugin] }) },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/') && !page.includes('/dev/') && !page.endsWith('/404/'),
      i18n: undefined,
    }),
  ],
  redirects: {
    '/o-mnie': '/o-nas',
  },
});
