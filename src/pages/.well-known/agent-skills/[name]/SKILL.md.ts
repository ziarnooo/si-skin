import type { APIRoute, GetStaticPaths } from 'astro';
import { SKILLS, buildSkillMarkdown } from '../../../../lib/agent';

export const prerender = true;

export const getStaticPaths = (() => SKILLS.map((skill) => ({ params: { name: skill.name } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params, site }) =>
  new Response(await buildSkillMarkdown(params.name as (typeof SKILLS)[number]['name'], site), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
