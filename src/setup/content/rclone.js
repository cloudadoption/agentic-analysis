import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

export async function clone({ projectDir, contentConfig }) {
  const dest = path.join(projectDir, 'content');
  await mkdir(dest, { recursive: true });

  const remoteSpec = contentConfig.path
    ? `${contentConfig.remote}:${contentConfig.path}`
    : `${contentConfig.remote}:`;

  const args = ['copy', remoteSpec, dest, '--progress'];
  for (const inc of contentConfig.include || []) args.push('--include', inc);
  for (const exc of contentConfig.exclude || []) args.push('--exclude', exc);

  try {
    await run('rclone', args);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        '`rclone` not found. Install: `brew install rclone`. ' +
        'Then configure your remote with `rclone config` (one-time).',
      );
    }
    throw err;
  }
}
