import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config(); // load .env if present; no-op in CI where the file is absent

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    exclude: ['projects/**', 'node_modules/**'],
  },
});
