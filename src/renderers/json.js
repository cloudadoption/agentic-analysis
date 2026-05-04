import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function render({ findings, synthesis, config, projectDir, slug }) {
  const out = {
    project: slug,
    customer: config.customer,
    site: config.site,
    generatedAt: new Date().toISOString(),
    counts: countsBySeverity(findings),
    synthesis: synthesis || null,
    findings,
  };
  await mkdir(projectDir, { recursive: true });
  const target = path.join(projectDir, 'findings.json');
  await writeFile(target, JSON.stringify(out, null, 2));
  return target;
}

function countsBySeverity(findings) {
  return findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});
}
