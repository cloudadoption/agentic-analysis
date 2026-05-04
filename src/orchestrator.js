import { getAnalyzer } from './analyzers/index.js';

export async function runAnalyzers({ config, projectDir, onEvent = () => {} }) {
  const results = await Promise.all(
    config.analyzers.map(async (name) => {
      const analyzer = getAnalyzer(name);
      onEvent({ type: 'analyzer:start', name });
      try {
        const findings = await analyzer.run({ projectDir, config });
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
