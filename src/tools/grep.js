import { spawn } from 'node:child_process';

export const spec = {
  name: 'grep',
  description: 'Search for a regex pattern across files using ripgrep-like behavior. Returns matching lines with file and line number.',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern (POSIX extended)' },
        path: { type: 'string', description: 'Subdirectory or glob to limit search; defaults to project root' },
        maxResults: { type: 'number', description: 'Max matching lines (default 200)' },
      },
      required: ['pattern'],
    },
  },
};

export function run({ pattern, path = '.', maxResults = 200 }, { projectRoot }) {
  return new Promise((resolve, reject) => {
    const args = ['-RnE', '--exclude-dir=node_modules', '--exclude-dir=.git', pattern, path];
    const p = spawn('grep', args, { cwd: projectRoot });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (code === 0 || code === 1) {
        const lines = out.split('\n').filter(Boolean).slice(0, maxResults);
        resolve(JSON.stringify({ count: lines.length, matches: lines }));
      } else {
        reject(new Error(`grep failed (${code}): ${err.trim()}`));
      }
    });
  });
}
