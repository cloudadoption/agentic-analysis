import mammoth from 'mammoth';
import path from 'node:path';

export const spec = {
  name: 'readDocx',
  description: 'Extract plain text from a .docx file. Returns the raw authored text (no styling).',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to a .docx file relative to project root' },
        maxChars: { type: 'number', description: 'Cap on characters returned (default 30000)' },
      },
      required: ['path'],
    },
  },
};

export async function run({ path: rel, maxChars = 30_000 }, { projectRoot }) {
  const abs = path.resolve(projectRoot, rel);
  if (!abs.startsWith(path.resolve(projectRoot) + path.sep)) {
    throw new Error(`Path escapes project root: ${rel}`);
  }
  if (!abs.toLowerCase().endsWith('.docx')) {
    throw new Error(`readDocx only supports .docx files: ${rel}`);
  }
  const { value } = await mammoth.extractRawText({ path: abs });
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[...truncated, ${value.length - maxChars} more chars]`;
}
