import type { APIRoute } from 'astro';
import { absoluteUrl, url } from '../lib/site';

export const prerender = true;

/** Boty, którym jawnie pozwalamy na dostęp (wyszukiwarki AI i asystenci). */
const AI_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'GPTBot', 'ClaudeBot', 'Google-Extended'];

export const GET: APIRoute = ({ site }) => {
  const rules = [`Allow: /`, `Disallow: ${url('/admin/')}`, 'Content-Signal: search=yes, ai-input=yes, ai-train=no'];
  const group = (agent: string) => [`User-agent: ${agent}`, ...rules].join('\n');

  const body = [
    group('*'),
    ...AI_BOTS.map(group),
    `Sitemap: ${absoluteUrl('/sitemap-index.xml', site)}`,
    '',
  ].join('\n\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
