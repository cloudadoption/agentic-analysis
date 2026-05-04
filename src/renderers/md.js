import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SEV_ICON = { critical: '🔴', warning: '🟡', info: '🔵', success: '🟢' };
const SEV_RANK = { critical: 0, warning: 1, info: 2, success: 3 };

const CATEGORY_LABEL = {
  security: 'Security',
  performance: 'Performance',
  accessibility: 'Accessibility',
  seo: 'SEO',
  'best-practice': 'Best Practices',
  configuration: 'Configuration',
  compatibility: 'Compatibility',
  architecture: 'Architecture',
  documentation: 'Documentation',
  testing: 'Testing',
  other: 'Other',
};

function counts(findings) {
  return findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, { critical: 0, warning: 0, info: 0, success: 0 });
}

function categoryWeight(findings) {
  return findings.reduce((acc, f) => acc + (f.severity === 'critical' ? 100 : f.severity === 'warning' ? 10 : f.severity === 'info' ? 1 : 0), 0);
}

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});
}

function renderFinding(f) {
  const lines = [];
  lines.push(`#### ${SEV_ICON[f.severity] || ''} ${f.title}`);
  lines.push('');
  lines.push(`**Severity:** ${f.severity}  ·  **Analyzer:** \`${f.analyzer}\`  ·  **Category:** ${f.category}`);
  lines.push('');
  if (f.description) {
    lines.push(f.description.trim());
    lines.push('');
  }
  if (f.recommendation) {
    lines.push(`**Recommendation:** ${f.recommendation.trim()}`);
    lines.push('');
  }
  if (f.evidence?.length) {
    lines.push('**Evidence:**');
    for (const e of f.evidence) {
      const where = (e.file || e.url || '') + (e.line && e.line > 0 ? `:${e.line}` : '');
      const excerpt = e.excerpt ? ` — \`${e.excerpt.replace(/`/g, "'").replace(/\n/g, ' ').slice(0, 200)}\`` : '';
      if (where) lines.push(`- \`${where}\`${excerpt}`);
      else if (excerpt) lines.push(`- ${excerpt}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function render({ findings, synthesis, config, projectDir, slug }) {
  await mkdir(projectDir, { recursive: true });
  const target = path.join(projectDir, 'report.md');
  const c = counts(findings);
  const byCat = groupBy(findings, (f) => f.category);
  const categoryOrder = Object.keys(byCat).sort((a, b) => categoryWeight(byCat[b]) - categoryWeight(byCat[a]));

  const out = [];
  out.push(`# ${config.customer} — Audit Report`);
  out.push('');
  out.push(`**Project:** \`${slug}\`  ·  **Site:** [${config.site}](${config.site})  ·  **Generated:** ${new Date().toISOString()}`);
  out.push('');
  out.push(`**Analyzers:** ${config.analyzers.join(', ')}`);
  out.push('');
  out.push(`**Findings:** ${findings.length} total — 🔴 ${c.critical} critical · 🟡 ${c.warning} warning · 🔵 ${c.info} info · 🟢 ${c.success} success`);
  out.push('');

  if (synthesis?.summary) {
    out.push('## Executive Summary');
    out.push('');
    out.push(synthesis.summary);
    out.push('');
  }
  if (synthesis?.topPriorities?.length) {
    out.push('### Top Priorities');
    out.push('');
    synthesis.topPriorities.forEach((p, i) => out.push(`${i + 1}. ${p}`));
    out.push('');
  }

  out.push('---');
  out.push('');

  for (const cat of categoryOrder) {
    const items = byCat[cat].slice().sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    const cc = counts(items);
    const label = CATEGORY_LABEL[cat] || cat;
    out.push(`## ${label}`);
    out.push('');
    out.push(`${items.length} finding${items.length === 1 ? '' : 's'} — 🔴 ${cc.critical} · 🟡 ${cc.warning} · 🔵 ${cc.info} · 🟢 ${cc.success}`);
    out.push('');
    const insight = synthesis?.categories?.[cat];
    if (insight?.insight) {
      out.push('### Insight');
      out.push('');
      out.push(insight.insight);
      out.push('');
    }
    if (insight?.recommendation) {
      out.push('### Recommendation');
      out.push('');
      out.push(insight.recommendation);
      out.push('');
    }
    out.push('### Findings');
    out.push('');
    for (const f of items) {
      out.push(renderFinding(f));
    }
    out.push('---');
    out.push('');
  }

  await writeFile(target, out.join('\n'));
  return target;
}
