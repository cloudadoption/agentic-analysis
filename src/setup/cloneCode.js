import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

export async function cloneCode({ projectDir, source, refresh = false }) {
  const target = path.join(projectDir, 'code');
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
