import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIRNAME = '.cache';

function cacheDir(projectDir) {
  return path.join(projectDir, CACHE_DIRNAME);
}

export async function readCached(projectDir, analyzer) {
  const file = path.join(cacheDir(projectDir), `${analyzer}.json`);
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.findings) ? parsed : null;
  } catch { return null; }
}

export async function writeCached(projectDir, analyzer, findings) {
  const dir = cacheDir(projectDir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${analyzer}.json`);
  await writeFile(file, JSON.stringify({
    analyzer,
    cachedAt: new Date().toISOString(),
    findings,
  }, null, 2));
}

export async function invalidate(projectDir, analyzersOrAll) {
  const dir = cacheDir(projectDir);
  if (analyzersOrAll === 'all') {
    await rm(dir, { recursive: true, force: true });
    return;
  }
  for (const name of analyzersOrAll) {
    await rm(path.join(dir, `${name}.json`), { force: true });
  }
}

export async function listCached(projectDir) {
  try {
    const entries = await readdir(cacheDir(projectDir));
    return entries.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  } catch { return []; }
}
