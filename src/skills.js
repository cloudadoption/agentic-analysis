import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadSkills(skillNames, { projectRoot }) {
  const blocks = [];
  for (const name of skillNames) {
    const skillPath = path.join(projectRoot, '.claude', 'skills', name, 'SKILL.md');
    try {
      const text = await readFile(skillPath, 'utf8');
      blocks.push(`# Skill: ${name}\n\n${text}`);
    } catch {
      blocks.push(`# Skill: ${name}\n\n(skill file not found at ${skillPath})`);
    }
  }
  return blocks.join('\n\n---\n\n');
}
