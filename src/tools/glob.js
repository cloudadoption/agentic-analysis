import fg from 'fast-glob';

export const spec = {
  name: 'glob',
  description: 'List files matching a glob pattern, relative to project root. Honors gitignore-style ignores by default.',
  inputSchema: {
    json: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "code/blocks/**/*.js"' },
        limit: { type: 'number', description: 'Max results (default 500)' },
      },
      required: ['pattern'],
    },
  },
};

export async function run({ pattern, limit = 200 }, { projectRoot }) {
  const matches = await fg(pattern, {
    cwd: projectRoot,
    dot: false,
    onlyFiles: true,
    ignore: [
      '**/node_modules/**', '**/.git/**',
      '**/dist/**', '**/build/**', '**/.cache/**',
      '**/fonts/**', '**/icons/**',
      '**/*.min.js', '**/*.min.css',
      '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.svg',
    ],
  });
  const sliced = matches.slice(0, limit);
  return JSON.stringify({
    count: matches.length,
    truncated: matches.length > limit,
    files: sliced,
  });
}
