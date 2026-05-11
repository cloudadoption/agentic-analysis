import { spawn } from 'node:child_process';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

function expand(p) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

export async function cloneCode({ projectDir, source, refresh = false }) {
  const target = path.join(projectDir, 'code');

  if (source.path) {
    const src = expand(source.path);
    if (!(await exists(src))) throw new Error(`Local code path not found: ${src}`);
    await mkdir(target, { recursive: true });
    const args = [
      '-a', '--delete', '--human-readable',
      '--exclude=.DS_Store',
      '--exclude=node_modules',
      '--exclude=.cache',
      src.endsWith('/') ? src : `${src}/`,
      `${target}/`,
    ];
    try {
      await run('rsync', args);
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error('`rsync` not found. macOS ships with it; on Linux: `apt install rsync`.');
      throw err;
    }
    return target;
  }

  const gitDir = path.join(target, '.git');
  if (await exists(gitDir)) {
    if (refresh) {
      await run('git', ['fetch', '--depth=1', 'origin', source.ref], { cwd: target });
      await run('git', ['checkout', source.ref], { cwd: target });
      await run('git', ['reset', '--hard', `origin/${source.ref}`], { cwd: target });
    }
    return target;
  }
  await run('git', ['clone', '--depth=1', '--branch', source.ref, source.repo, target]);
  return target;
}
