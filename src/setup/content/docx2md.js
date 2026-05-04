import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { docx2md } from '@adobe/helix-docx2md';
import { loadManifest, saveManifest, writeExcludes } from './manifest.js';

const CONCURRENCY = 8;

export async function convertAll({ contentDir, projectDir }) {
  const files = await fg('**/*.docx', {
    cwd: contentDir,
    dot: false,
    onlyFiles: true,
    ignore: [
      '**/~$*',
      '**/.~lock.*',
      '**/.DS_Store',
      '**/Thumbs.db',
    ],
  });

  const manifest = await loadManifest(projectDir);
  let converted = 0;
  let failed = 0;

  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      const rel = files[i];
      const docxAbs = path.join(contentDir, rel);
      const mdRel = rel.replace(/\.docx$/i, '.md');
      const mdAbs = path.join(contentDir, mdRel);
      try {
        const docxStat = await stat(docxAbs);
        const buf = await readFile(docxAbs);
        const md = await docx2md(buf, {});
        await mkdir(path.dirname(mdAbs), { recursive: true });
        await writeFile(mdAbs, md);
        manifest.entries[rel] = {
          sourceMtime: docxStat.mtimeMs,
          convertedAt: new Date().toISOString(),
        };
        await unlink(docxAbs);
        converted++;
      } catch (err) {
        failed++;
        console.warn(`[docx2md] ${rel}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await saveManifest(projectDir, manifest);
  await writeExcludes(projectDir, manifest);

  const protect = Object.keys(manifest.entries).length;
  console.log(`[docx2md] converted=${converted} failed=${failed} new-this-run=${files.length} manifest=${protect} (.docx files now removed; protected from future rsync)`);
}
