import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function clone({ projectDir }) {
  const dest = path.join(projectDir, 'content');
  await mkdir(dest, { recursive: true });
  let entries = [];
  try { entries = await readdir(dest); } catch {}
  if (entries.length === 0) {
    console.warn(`[content:manual] ${dest} is empty. Drop your content snapshot there before running analyzers.`);
  } else {
    console.log(`[content:manual] using existing content at ${dest} (${entries.length} top-level entries)`);
  }
}
