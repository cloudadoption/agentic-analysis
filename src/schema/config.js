import { z } from 'zod';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const ConfigSchema = z.object({
  customer: z.string().min(1),
  site: z.string().url(),
  source: z.object({
    code: z.object({
      repo: z.string().url(),
      ref: z.string().default('main'),
    }),
  }),
  content: z.discriminatedUnion('source', [
    z.object({ source: z.literal('da') }),
    z.object({
      source: z.literal('rclone'),
      remote: z.string().min(1),
      path: z.string().default(''),
      include: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
    }),
    z.object({
      source: z.literal('local'),
      path: z.string().min(1),
      include: z.array(z.string()).default([]),
      exclude: z.array(z.string()).default([]),
    }),
    z.object({ source: z.literal('manual') }),
    z.object({ source: z.literal('none') }),
  ]).default({ source: 'da' }),
  analyzers: z.array(z.string()).min(1),
  output: z.array(z.enum(['json', 'html', 'md', 'pdf'])).min(1),
  cwv: z.object({
    device: z.enum(['mobile', 'desktop']).default('mobile'),
    action: z.string().default('agent'),
    model: z.string().optional(),
    path: z.string().optional(),
    skipCache: z.boolean().default(false),
  }).partial().optional(),
  accessibility: z.object({ pages: z.array(z.string()).default(['/']) }).partial().optional(),
});

export function projectsDir(repoRoot) {
  return path.join(repoRoot, 'projects');
}

export function projectDir(repoRoot, slug) {
  return path.join(projectsDir(repoRoot), slug);
}

export async function listProjects(repoRoot) {
  const root = projectsDir(repoRoot);
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch { return []; }
  const slugs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const cfg = path.join(root, e.name, 'audit.config.json');
    try { await stat(cfg); slugs.push(e.name); } catch {}
  }
  return slugs.sort();
}

export async function loadProjectConfig(repoRoot, slug) {
  const dir = projectDir(repoRoot, slug);
  const cfgPath = path.join(dir, 'audit.config.json');
  const raw = await readFile(cfgPath, 'utf8').catch(() => {
    throw new Error(`No audit.config.json at ${cfgPath}. Run \`audit init ${slug}\`.`);
  });
  const parsed = JSON.parse(raw);
  return { slug, dir, config: ConfigSchema.parse(parsed) };
}

export async function resolveTargets(repoRoot, { slugs, all }) {
  const available = await listProjects(repoRoot);
  if (available.length === 0) {
    throw new Error(`No projects found under ${projectsDir(repoRoot)}. Run \`audit init <slug>\` to create one.`);
  }
  let targets;
  if (all) {
    targets = available;
  } else if (slugs && slugs.length) {
    const missing = slugs.filter((s) => !available.includes(s));
    if (missing.length) throw new Error(`Unknown project(s): ${missing.join(', ')}. Available: ${available.join(', ')}`);
    targets = slugs;
  } else if (available.length === 1) {
    targets = available;
  } else {
    throw new Error(`Multiple projects exist (${available.join(', ')}). Pass --project <slug> (repeatable) or --all.`);
  }
  return Promise.all(targets.map((s) => loadProjectConfig(repoRoot, s)));
}
