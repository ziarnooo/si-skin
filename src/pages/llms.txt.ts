import type { APIRoute } from 'astro';
import { buildLlmsTxt } from '../lib/agent';

export const prerender = true;

export const GET: APIRoute = async ({ site }) =>
  new Response(await buildLlmsTxt(site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
