import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { convertAll } from './docx2md.js';

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

  const args = ['-a', '--delete', '--stats', '--human-readable'];
  for (const inc of contentConfig.include || []) args.push('--include', inc);
  for (const exc of contentConfig.exclude || []) args.push('--exclude', exc);
  args.push(src.endsWith('/') ? src : `${src}/`, `${dest}/`);

  try {
    await run('rsync', args);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('`rsync` not found. macOS ships with it; on Linux: `apt install rsync`.');
    }
    throw err;
  }

  console.log(`[content:local] converting .docx -> .md`);
  await convertAll({ contentDir: dest });
}
