import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const spec = {
  name: 'readFile',
  description: 'Read a UTF-8 text file from the project. Path is resolved relative to the project root and must stay within it.',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to project root, e.g. "code/blocks/hero/hero.js"' },
        maxBytes: { type: 'number', description: 'Optional cap on bytes returned (default 200000)' },
      },
      required: ['path'],
    },
  },
};

export async function run({ path: rel, maxBytes = 15_000 }, { projectRoot }) {
  const abs = path.resolve(projectRoot, rel);
  if (!abs.startsWith(path.resolve(projectRoot) + path.sep) && abs !== path.resolve(projectRoot)) {
    throw new Error(`Path escapes project root: ${rel}`);
  }
  const buf = await readFile(abs);
  const slice = buf.subarray(0, maxBytes).toString('utf8');
  const truncated = buf.length > maxBytes;
  return truncated ? `${slice}\n\n[...truncated, ${buf.length - maxBytes} more bytes]` : slice;
}
