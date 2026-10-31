import type { APIRoute } from 'astro';
import { getSiteData } from '../../lib/agent';

export const prerender = true;

export const GET: APIRoute = async ({ site }) =>
  new Response(JSON.stringify(await getSiteData(site), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
