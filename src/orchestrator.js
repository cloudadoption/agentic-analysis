import { getAnalyzer } from './analyzers/index.js';
import { readCached, writeCached } from './cache.js';

export async function runAnalyzers({ config, projectDir, onEvent = () => {} }) {
  const results = await Promise.all(
    config.analyzers.map(async (name) => {
      const analyzer = getAnalyzer(name);
      const cached = await readCached(projectDir, name);
      if (cached) {
        onEvent({ type: 'analyzer:cached', name, count: cached.findings.length, cachedAt: cached.cachedAt });
        return cached.findings;
      }
      onEvent({ type: 'analyzer:start', name });
      try {
        const findings = await analyzer.run({
          projectDir,
          config,
          onEvent: (e) => onEvent({ ...e, analyzer: name }),
        });
        await writeCached(projectDir, name, findings);
        onEvent({ type: 'analyzer:done', name, count: findings.length });
        return findings;
      } catch (err) {
        onEvent({ type: 'analyzer:error', name, error: err.message });
        return [];
      }
    }),
  );
  return results.flat();
}
