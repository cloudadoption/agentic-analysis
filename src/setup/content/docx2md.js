import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { docx2md } from '@adobe/helix-docx2md';

const CONCURRENCY = 8;

export async function convertAll({ contentDir }) {
  const files = await fg('**/*.docx', { cwd: contentDir, dot: false, onlyFiles: true });
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      const rel = files[i];
      const docxAbs = path.join(contentDir, rel);
      const mdAbs = docxAbs.replace(/\.docx$/i, '.md');
      try {
        const docxStat = await stat(docxAbs);
        try {
          const mdStat = await stat(mdAbs);
          if (mdStat.mtimeMs >= docxStat.mtimeMs) { skipped++; continue; }
        } catch {}
        const buf = await readFile(docxAbs);
        const md = await docx2md(buf, {});
        await writeFile(mdAbs, md);
        converted++;
      } catch (err) {
        failed++;
        console.warn(`[docx2md] ${rel}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[docx2md] converted=${converted} skipped=${skipped} failed=${failed} total=${files.length}`);
}
