import type { APIRoute } from 'astro';
import { buildLlmsFullTxt } from '../lib/agent';

export const prerender = true;

export const GET: APIRoute = async ({ site }) =>
  new Response(await buildLlmsFullTxt(site), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
