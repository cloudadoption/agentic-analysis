import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)));
  });
}

export async function clone({ projectDir }) {
  const codeDir = path.join(projectDir, 'code');
  try { await stat(codeDir); } catch {
    throw new Error(`Code repo not found at ${codeDir}. Run code clone first.`);
  }
  try {
    await run('aem', ['content', 'clone', '--all'], { cwd: codeDir });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('`aem` CLI not found. Install: `npm i -g @adobe/helix-cli`. Then `aem login`.');
    }
    throw err;
  }
}
