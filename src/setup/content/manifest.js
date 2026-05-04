import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const VERSION = 1;

export function manifestPath(projectDir) {
  return path.join(projectDir, '.cache', 'docx2md-manifest.json');
}

export function excludesPath(projectDir) {
  return path.join(projectDir, '.cache', 'rsync-excludes.txt');
}

export async function loadManifest(projectDir) {
  try {
    const parsed = JSON.parse(await readFile(manifestPath(projectDir), 'utf8'));
    if (parsed.version === VERSION && parsed.entries && typeof parsed.entries === 'object') return parsed;
  } catch {}
  return { version: VERSION, entries: {} };
}

export async function saveManifest(projectDir, manifest) {
  const p = manifestPath(projectDir);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(manifest, null, 2));
}

// Walks the manifest and removes entries where:
//  - the source .docx was deleted upstream
//  - the source .docx mtime is newer than the recorded mtime (upstream edit)
//  - the converted .md sibling no longer exists in dest
// Returns the cleaned manifest plus how many entries were removed.
export async function validateManifest({ manifest, sourceDir, contentDir }) {
  const kept = {};
  let removed = 0;
  for (const [relPath, entry] of Object.entries(manifest.entries)) {
    const srcAbs = path.join(sourceDir, relPath);
    const mdAbs = path.join(contentDir, relPath.replace(/\.docx$/i, '.md'));
    let valid = true;
    try {
      const s = await stat(srcAbs);
      if (s.mtimeMs > entry.sourceMtime) valid = false;
    } catch { valid = false; }
    if (valid) {
      try { await stat(mdAbs); } catch { valid = false; }
    }
    if (valid) kept[relPath] = entry;
    else removed++;
  }
  return { manifest: { version: VERSION, entries: kept }, removed };
}

export async function writeExcludes(projectDir, manifest) {
  const p = excludesPath(projectDir);
  await mkdir(path.dirname(p), { recursive: true });
  // Anchor each entry with leading slash so rsync only excludes the exact path,
  // not any file with the same name elsewhere in the tree.
  const lines = Object.keys(manifest.entries).sort().map((rel) => `/${rel}`);
  await writeFile(p, lines.length ? `${lines.join('\n')}\n` : '');
  return p;
}
