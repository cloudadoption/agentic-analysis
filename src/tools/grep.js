import { spawn } from 'node:child_process';

export const spec = {
  name: 'grep',
  description: 'Search for a regex pattern across files using ripgrep-like behavior. Returns matching lines with file and line number. Caps results to avoid blowing context — narrow the path when searching large trees.',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern (POSIX extended)' },
        path: { type: 'string', description: 'Subdirectory or glob to limit search; defaults to project root. STRONGLY prefer a narrow path on large repos.' },
        maxResults: { type: 'number', description: 'Max matching lines (default 200, hard cap 1000)' },
      },
      required: ['pattern'],
    },
  },
};

const MAX_BYTES = 2_000_000; // 2 MB hard cap on accumulated output

export function run({ pattern, path = '.', maxResults = 200 }, { projectRoot }) {
  const cap = Math.min(Math.max(1, maxResults), 1000);
  return new Promise((resolve) => {
    const args = ['-RnE', '--exclude-dir=node_modules', '--exclude-dir=.git', pattern, path];
    const p = spawn('grep', args, { cwd: projectRoot });

    const lines = [];
    let bytes = 0;
    let buf = '';
    let truncated = false;
    let stderr = '';

    function done(reason) {
      if (p.exitCode == null && !p.killed) {
        try { p.kill('SIGTERM'); } catch {}
      }
      resolve(JSON.stringify({
        count: lines.length,
        truncated,
        reason,
        matches: lines,
      }));
    }

    p.stdout.on('data', (chunk) => {
      if (truncated) return;
      bytes += chunk.length;
      if (bytes > MAX_BYTES) { truncated = true; return done(`byte cap (${MAX_BYTES})`); }
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line) lines.push(line);
        if (lines.length >= cap) { truncated = true; return done(`line cap (${cap})`); }
      }
    });

    p.stderr.on('data', (d) => { stderr += d.toString(); });

    p.on('error', (e) => resolve(JSON.stringify({ error: e.message, count: 0, matches: [] })));
    p.on('close', (code) => {
      if (truncated) return;
      if (buf) lines.push(buf);
      if (code === 0 || code === 1) {
        resolve(JSON.stringify({ count: lines.length, truncated: false, matches: lines }));
      } else {
        resolve(JSON.stringify({ error: `grep exited ${code}: ${stderr.trim().slice(0, 500)}`, count: lines.length, matches: lines }));
      }
    });
  });
}
