import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { convertAll } from './docx2md.js';
import { loadManifest, saveManifest, validateManifest, writeExcludes, excludesPath } from './manifest.js';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

function expand(p) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function clone({ projectDir, contentConfig }) {
  const src = expand(contentConfig.path);
  try { await stat(src); } catch {
    throw new Error(`Local content path not found: ${src}`);
  }
  const dest = path.join(projectDir, 'content');
  await mkdir(dest, { recursive: true });

  console.log('[content:local] validating docx2md manifest against source + dest…');
  const loaded = await loadManifest(projectDir);
  const { manifest: cleaned, removed } = await validateManifest({ manifest: loaded, sourceDir: src, contentDir: dest });
  await saveManifest(projectDir, cleaned);
  const excludesFile = await writeExcludes(projectDir, cleaned);
  const protected_ = Object.keys(cleaned.entries).length;
  console.log(`[content:local] manifest: ${protected_} .docx protected from re-sync${removed ? `, ${removed} stale entries pruned` : ''}`);

  // Binary asset extensions: not consumed by any analyzer (which read .md files
  // or hit live URLs). Excluding them shrinks sync size dramatically.
  const BINARY_EXCLUDES = [
    // images
    '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.svg', '*.ico', '*.bmp', '*.tiff', '*.tif', '*.heic', '*.heif', '*.avif',
    // video
    '*.mp4', '*.mov', '*.avi', '*.mkv', '*.webm', '*.flv', '*.wmv', '*.m4v',
    // audio
    '*.mp3', '*.wav', '*.ogg', '*.m4a', '*.flac', '*.aac',
    // archives
    '*.zip', '*.tar', '*.tar.gz', '*.tgz', '*.gz', '*.rar', '*.7z',
    // design / large source files
    '*.psd', '*.ai', '*.indd', '*.sketch', '*.fig', '*.xd',
    // misc large binaries
    '*.pdf',
  ];

  const args = [
    '-a', '--delete', '--stats', '--human-readable', '--info=progress2', '--no-inc-recursive',
    '--exclude=~$*',
    '--exclude=.~lock.*',
    '--exclude=.DS_Store',
    '--exclude=Thumbs.db',
    '--exclude=*.md',
    `--exclude-from=${excludesFile}`,
  ];
  // User includes go FIRST so they win the first-match rule (e.g. a project that
  // genuinely needs PDFs or images can `"include": ["*.pdf"]`).
  for (const inc of contentConfig.include || []) args.push('--include', inc);
  for (const exc of contentConfig.exclude || []) args.push('--exclude', exc);
  for (const exc of BINARY_EXCLUDES) args.push(`--exclude=${exc}`);
  args.push(src.endsWith('/') ? src : `${src}/`, `${dest}/`);

  try {
    await run('rsync', args);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('`rsync` not found. macOS ships with it; on Linux: `apt install rsync`.');
    }
    throw err;
  }

  console.log('[content:local] converting any new .docx -> .md (and removing the .docx after)…');
  await convertAll({ contentDir: dest, projectDir });
}
