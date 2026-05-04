import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

async function safeRead(p) {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

async function listMarkdownIn(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
      .map((e) => path.join(dir, e.name))
      .sort();
  } catch { return []; }
}

export async function loadSkills(skillNames, { projectRoot }) {
  const blocks = [];
  for (const name of skillNames) {
    const skillDir = path.join(projectRoot, '.claude', 'skills', name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    const main = await safeRead(skillFile);
    if (main == null) {
      blocks.push(`# Skill: ${name}\n\n(skill file not found at ${skillFile})`);
      continue;
    }
    const parts = [`# Skill: ${name}`, '', main];
    const resourceFiles = await listMarkdownIn(path.join(skillDir, 'resources'));
    for (const rf of resourceFiles) {
      const text = await safeRead(rf);
      if (text == null) continue;
      const rel = path.relative(skillDir, rf);
      parts.push('', `## Resource: ${rel}`, '', text);
    }
    blocks.push(parts.join('\n'));
  }
  return blocks.join('\n\n---\n\n');
}
