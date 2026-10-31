import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { SKILLS, buildSkillMarkdown } from '../../../lib/agent';
import { absoluteUrl } from '../../../lib/site';

export const prerender = true;

/** Agent Skills Discovery: lista umiejętności z sumą SHA-256 liczoną z treści SKILL.md w czasie buildu. */
export const GET: APIRoute = async ({ site }) => {
  const skills = await Promise.all(
    SKILLS.map(async (skill) => {
      const markdown = await buildSkillMarkdown(skill.name, site);
      return {
        name: skill.name,
        type: 'skill-md',
        description: skill.description,
        url: absoluteUrl(`/.well-known/agent-skills/${skill.name}/SKILL.md`, site),
        digest: `sha256:${createHash('sha256').update(markdown).digest('hex')}`,
      };
    }),
  );
  return new Response(
    JSON.stringify({ $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills }, null, 2),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
};
