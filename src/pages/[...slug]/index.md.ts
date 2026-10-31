import type { APIRoute, GetStaticPaths } from 'astro';
import { getSitePages } from '../../lib/agent';

export const prerender = true;

/** Markdownowa wersja każdej strony: /cennik/ → /cennik/index.md, strona główna → /index.md */
export const getStaticPaths = (async () => {
  const pages = await getSitePages(undefined);
  return pages.map((page) => ({
    params: { slug: page.path === '/' ? undefined : page.path.replace(/^\/|\/$/g, '') },
    props: { path: page.path },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props, site }) => {
  const pages = await getSitePages(site);
  const page = pages.find((p) => p.path === props.path)!;
  return new Response(await page.markdown(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
