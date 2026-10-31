import type { APIRoute } from 'astro';
import { absoluteUrl } from '../../lib/site';

export const prerender = true;

/** RFC 9727 — katalog API jako linkset+json. Wskazuje wyłącznie to, co strona faktycznie udostępnia. */
export const GET: APIRoute = ({ site }) => {
  const siteJson = absoluteUrl('/api/site.json', site);
  const catalog = {
    linkset: [
      {
        anchor: absoluteUrl('/.well-known/api-catalog', site),
        item: [{ href: siteJson, type: 'application/json' }],
      },
      {
        anchor: siteJson,
        'service-doc': [{ href: absoluteUrl('/llms.txt', site), type: 'text/plain' }],
        describedby: [{ href: absoluteUrl('/llms-full.txt', site), type: 'text/plain' }],
      },
    ],
  };
  return new Response(JSON.stringify(catalog, null, 2), {
    headers: { 'Content-Type': 'application/linkset+json; charset=utf-8' },
  });
};
