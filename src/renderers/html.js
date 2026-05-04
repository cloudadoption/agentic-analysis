import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function render({ findings, synthesis, config, projectDir, slug }) {
  await mkdir(projectDir, { recursive: true });
  const target = path.join(projectDir, 'report.html');
  const html = buildHtml({ findings, synthesis, config, slug });
  await writeFile(target, html);
  return target;
}

function escape(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const SEV_ORDER = ['critical', 'warning', 'info', 'success'];
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
  return findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, { critical: 0, warning: 0, info: 0, success: 0 });
}

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});
}

function categoryWeight(findings) {
  return findings.reduce((acc, f) => acc + (f.severity === 'critical' ? 100 : f.severity === 'warning' ? 10 : f.severity === 'info' ? 1 : 0), 0);
}

function buildHtml({ findings, synthesis, config, slug }) {
  const c = counts(findings);
  const generatedAt = new Date().toISOString();
  const byCategory = groupBy(findings, (f) => f.category);
  const categoryOrder = Object.keys(byCategory).sort((a, b) => categoryWeight(byCategory[b]) - categoryWeight(byCategory[a]));

  const data = JSON.stringify({ findings, synthesis: synthesis || null, byCategory: categoryOrder.map((cat) => ({
    name: cat,
    label: CATEGORY_LABEL[cat] || cat,
    counts: counts(byCategory[cat]),
    insight: synthesis?.categories?.[cat]?.insight || '',
    recommendation: synthesis?.categories?.[cat]?.recommendation || '',
    findings: byCategory[cat].slice().sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]),
  })) }).replaceAll('</', '<\\/');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Audit — ${escape(config.customer)}</title>
<style>
  :root {
    --bg: #0b0d10;
    --panel: #14181d;
    --panel-2: #1a2027;
    --text: #e8eaed;
    --muted: #9aa3ad;
    --border: #262d36;
    --critical: #ff5d5d;
    --warning: #ffb84d;
    --info: #6cb1ff;
    --success: #62d97a;
    --link: #6cb1ff;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--text); }
  @media print {
    :root { --bg: #fff; --panel: #f8f9fa; --panel-2: #f1f3f5; --text: #1a1d20; --muted: #5a6470; --border: #d0d4da; --critical: #c92a2a; --warning: #b25e00; --info: #1864ab; --success: #2b8a3e; --link: #1864ab; }
    body, header.top, section.exec, .stats, .controls, .category > .head { background: var(--bg); color: var(--text); }
    .controls { display: none; }
    .row-detail { display: table-row !important; }
    .row-detail.hidden { display: table-row !important; }
    tbody tr.row { page-break-inside: avoid; }
    .category { page-break-inside: avoid; }
  }
  a { color: var(--link); }

  header.top { padding: 24px 32px; border-bottom: 1px solid var(--border); background: var(--panel); }
  header.top h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  header.top .meta { color: var(--muted); font-size: 13px; }

  section.exec { padding: 20px 32px; border-bottom: 1px solid var(--border); background: var(--panel); }
  section.exec h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.06em; }
  section.exec p.summary { margin: 0 0 12px; font-size: 15px; }
  section.exec ol { margin: 0; padding-left: 20px; }
  section.exec ol li { margin: 4px 0; }

  .stats { display: flex; gap: 12px; padding: 16px 32px; border-bottom: 1px solid var(--border); background: var(--panel); flex-wrap: wrap; }
  .stat { padding: 10px 16px; border-radius: 6px; background: var(--panel-2); border-left: 3px solid var(--border); min-width: 110px; }
  .stat .n { font-size: 22px; font-weight: 600; }
  .stat .l { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
  .stat.critical { border-left-color: var(--critical); }
  .stat.warning  { border-left-color: var(--warning); }
  .stat.info     { border-left-color: var(--info); }
  .stat.success  { border-left-color: var(--success); }

  .controls { display: flex; gap: 8px; padding: 12px 32px; flex-wrap: wrap; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 5; }
  .controls input, .controls select {
    background: var(--panel-2); color: var(--text); border: 1px solid var(--border);
    padding: 6px 10px; border-radius: 4px; font: inherit;
  }
  .controls input { flex: 1; min-width: 200px; }

  .category { border-bottom: 1px solid var(--border); }
  .category > .head { padding: 16px 32px; background: var(--panel); display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
  .category .head h3 { margin: 0; font-size: 16px; }
  .category .head .pill { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; background: var(--panel-2); color: var(--muted); margin-left: 6px; }
  .category .head .pill.critical { color: var(--critical); }
  .category .head .pill.warning { color: var(--warning); }
  .category .head .pill.info { color: var(--info); }
  .category .head .pill.success { color: var(--success); }
  .category .insight { padding: 12px 32px 4px; color: var(--text); }
  .category .insight .label { font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; margin-bottom: 4px; }
  .category .insight p { margin: 0 0 12px; }

  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; padding: 8px 32px; background: var(--panel-2); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
  tbody tr.row { border-bottom: 1px solid var(--border); cursor: pointer; }
  tbody tr.row:hover { background: var(--panel); }
  tbody td { padding: 10px 12px; vertical-align: top; }
  tbody td.left { padding-left: 32px; }
  tbody td.right { padding-right: 32px; }
  .sev { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
  .sev.critical { background: rgba(255,93,93,0.15); color: var(--critical); }
  .sev.warning  { background: rgba(255,184,77,0.15); color: var(--warning); }
  .sev.info     { background: rgba(108,177,255,0.15); color: var(--info); }
  .sev.success  { background: rgba(98,217,122,0.15); color: var(--success); }
  .row-detail { background: var(--panel); }
  .row-detail td { padding: 14px 32px 18px; }
  .row-detail h4 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; }
  .row-detail p { margin: 0 0 12px; white-space: pre-wrap; }
  .row-detail .evidence { background: var(--panel-2); border: 1px solid var(--border); border-radius: 4px; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; margin: 4px 0; }
  .row-detail .evidence .file { color: var(--muted); margin-bottom: 4px; word-break: break-all; }
  .empty { padding: 40px 32px; color: var(--muted); text-align: center; }
  .hidden { display: none; }
</style>
</head>
<body>
<header class="top">
  <h1>${escape(config.customer)} — Audit</h1>
  <div class="meta">
    Project <strong>${escape(slug)}</strong> ·
    <a href="${escape(config.site)}" target="_blank" rel="noopener">${escape(config.site)}</a> ·
    Generated ${escape(generatedAt)} ·
    Analyzers: ${escape(config.analyzers.join(', '))}
  </div>
</header>

${synthesis ? `<section class="exec">
  <h2>Executive Summary</h2>
  <p class="summary">${escape(synthesis.summary || '')}</p>
  ${(synthesis.topPriorities && synthesis.topPriorities.length) ? `
  <h2>Top Priorities</h2>
  <ol>${synthesis.topPriorities.map((p) => `<li>${escape(p)}</li>`).join('')}</ol>` : ''}
</section>` : ''}

<section class="stats">
  <div class="stat critical"><div class="n">${c.critical}</div><div class="l">Critical</div></div>
  <div class="stat warning"><div class="n">${c.warning}</div><div class="l">Warning</div></div>
  <div class="stat info"><div class="n">${c.info}</div><div class="l">Info</div></div>
  <div class="stat success"><div class="n">${c.success}</div><div class="l">Success</div></div>
  <div class="stat"><div class="n">${findings.length}</div><div class="l">Total</div></div>
</section>

<section class="controls">
  <input id="q" type="search" placeholder="Filter findings…" />
  <select id="sev"><option value="">All severities</option><option>critical</option><option>warning</option><option>info</option><option>success</option></select>
  <select id="ana"><option value="">All analyzers</option></select>
</section>

<main id="cats"></main>
<div id="empty" class="empty hidden">No findings match the current filters.</div>

<script>
  const DATA = ${data};
  const q = document.getElementById('q');
  const sev = document.getElementById('sev');
  const ana = document.getElementById('ana');
  const cats = document.getElementById('cats');
  const emptyMsg = document.getElementById('empty');

  for (const a of [...new Set(DATA.findings.map((f) => f.analyzer))].sort()) {
    const o = document.createElement('option'); o.value = a; o.textContent = a; ana.appendChild(o);
  }
  [q, sev, ana].forEach((el) => el.addEventListener('input', render));

  function escapeHtml(s = '') {
    return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function matches(f) {
    if (sev.value && f.severity !== sev.value) return false;
    if (ana.value && f.analyzer !== ana.value) return false;
    const term = q.value.trim().toLowerCase();
    if (!term) return true;
    const hay = (f.title + ' ' + (f.description || '') + ' ' + (f.recommendation || '') + ' ' + (f.evidence || []).map((e) => e.file || e.url || '').join(' ')).toLowerCase();
    return hay.includes(term);
  }

  function pill(label, n, klass) {
    if (!n) return '';
    return '<span class="pill ' + klass + '">' + n + ' ' + label + '</span>';
  }

  function renderRow(f) {
    const tr = document.createElement('tr');
    tr.className = 'row';
    tr.innerHTML = '<td class="left"><span class="sev ' + escapeHtml(f.severity) + '">' + escapeHtml(f.severity) + '</span></td>'
      + '<td>' + escapeHtml(f.analyzer) + '</td>'
      + '<td class="right">' + escapeHtml(f.title) + '</td>';
    const detail = document.createElement('tr');
    detail.className = 'row-detail hidden';
    const td = document.createElement('td');
    td.colSpan = 3;
    const ev = (f.evidence || []).map((e) => {
      const fileLine = (e.file || e.url || '') + (e.line && e.line > 0 ? ':' + e.line : '');
      return '<div class="evidence"><div class="file">' + escapeHtml(fileLine) + '</div>' + (e.excerpt ? '<div>' + escapeHtml(e.excerpt) + '</div>' : '') + '</div>';
    }).join('');
    td.innerHTML = '<h4>Description</h4><p>' + escapeHtml(f.description || '') + '</p>'
      + (f.recommendation ? '<h4>Recommendation</h4><p>' + escapeHtml(f.recommendation) + '</p>' : '')
      + (ev ? '<h4>Evidence</h4>' + ev : '');
    detail.appendChild(td);
    tr.addEventListener('click', () => detail.classList.toggle('hidden'));
    return [tr, detail];
  }

  function render() {
    cats.innerHTML = '';
    let totalShown = 0;
    for (const cat of DATA.byCategory) {
      const visible = cat.findings.filter(matches);
      if (!visible.length) continue;
      totalShown += visible.length;
      const sec = document.createElement('section');
      sec.className = 'category';

      const c = visible.reduce((a, f) => { a[f.severity] = (a[f.severity] || 0) + 1; return a; }, {});
      sec.innerHTML = '<div class="head"><h3>' + escapeHtml(cat.label) + '</h3>'
        + pill('critical', c.critical, 'critical')
        + pill('warning', c.warning, 'warning')
        + pill('info', c.info, 'info')
        + pill('success', c.success, 'success')
        + '</div>'
        + (cat.insight ? '<div class="insight"><div class="label">Insight</div><p>' + escapeHtml(cat.insight) + '</p>' + (cat.recommendation ? '<div class="label">Recommendation</div><p>' + escapeHtml(cat.recommendation) + '</p>' : '') + '</div>' : '');

      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th class="left" style="width: 110px">Severity</th><th style="width: 140px">Analyzer</th><th class="right">Title</th></tr></thead>';
      const tbody = document.createElement('tbody');
      for (const f of visible) {
        const [tr, detail] = renderRow(f);
        tbody.appendChild(tr); tbody.appendChild(detail);
      }
      table.appendChild(tbody);
      sec.appendChild(table);
      cats.appendChild(sec);
    }
    emptyMsg.classList.toggle('hidden', totalShown > 0);
  }
  render();
</script>
</body>
</html>`;
}
