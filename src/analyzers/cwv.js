import { spawn } from 'node:child_process';
import { stat, readFile, copyFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';


export const meta = { name: 'cwv', skills: [], tools: [] };

import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CWV_AGENT_PATH = path.resolve(__dirname, 'cwv', 'vendor');

function f(partial) {
  return { analyzer: 'cwv', severity: 'info', category: 'performance', evidence: [], ...partial };
}

function rewriteLine(line) {
  if (line.includes('Failed to collect CrUX data.') && /API key not valid/i.test(line)) {
    return line.replace(
      /❌ Failed to collect CrUX data\..*$/,
      'ℹ️  No CrUX field data available (site likely has insufficient real-user traffic to be in the CrUX dataset). Continuing with lab data only.',
    );
  }
  return line;
}

function makeLineFilter(stream) {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString();
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) stream.write(`${rewriteLine(line)}\n`);
  };
}

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let out = '', err = '';
    const onOut = makeLineFilter(process.stdout);
    const onErr = makeLineFilter(process.stderr);
    p.stdout?.on('data', (d) => { out += d.toString(); onOut(d); });
    p.stderr?.on('data', (d) => { err += d.toString(); onErr(d); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

function domainSlug(url) {
  return new URL(url).host.replace(/\./g, '-');
}

export async function run({ config, projectDir }) {
  const cwvCfg = config.cwv || {};
  const device = cwvCfg.device || 'mobile';
  const action = cwvCfg.action || 'agent';
  const cwvAgentPath = cwvCfg.path || DEFAULT_CWV_AGENT_PATH;

  try { await stat(cwvAgentPath); } catch {
    return [f({
      id: 'cwv-not-installed',
      severity: 'info',
      title: 'CWV agent not found — analyzer skipped',
      description: `Set config.cwv.path or place cwv-agent at ${cwvAgentPath} to enable Core Web Vitals analysis.`,
      evidence: [{ file: cwvAgentPath }],
    })];
  }

  const args = ['index.js', '--action', action, '--url', config.site, '--device', device];
  if (cwvCfg.model) args.push('--model', cwvCfg.model);
  if (cwvCfg.skipCache) args.push('--skip-cache');

  const { code } = await runCmd('node', args, { cwd: cwvAgentPath });
  if (code !== 0) {
    return [f({
      id: 'cwv-run-failed',
      severity: 'warning',
      title: `cwv-agent exited with code ${code}`,
      description: `\`node ${args.join(' ')}\` failed. Check that cwv-agent's dependencies are installed and any required env vars (e.g. API keys) are set.`,
      evidence: [{ file: cwvAgentPath }],
    })];
  }

  const cacheDir = path.join(cwvAgentPath, '.cache');
  const slug = domainSlug(config.site);
  let entries = [];
  try { entries = await readdir(cacheDir); } catch {}
  const reports = entries
    .filter((n) => n.startsWith(`${slug}.${device}.`) && /\.summary\.md$/.test(n))
    .sort();
  const latest = reports[reports.length - 1];

  if (!latest) {
    return [f({
      id: 'cwv-no-output',
      severity: 'warning',
      title: 'cwv-agent ran but produced no summary report',
      description: `No matching files in ${cacheDir} for ${slug}.${device}.*.summary.md.`,
      evidence: [{ file: cacheDir }],
    })];
  }

  const dest = path.join(projectDir, 'cwv');
  await mkdir(dest, { recursive: true });
  await copyFile(path.join(cacheDir, latest), path.join(dest, latest));
  const md = await readFile(path.join(cacheDir, latest), 'utf8');

  const summaryMatch = md.match(/###\s*\*\*Executive Summary\*\*([\s\S]*?)(?=\n###\s*\*\*|\Z)/i);
  const summaryText = summaryMatch ? summaryMatch[1].trim() : md.slice(0, 1500);

  const metrics = await readCwvMetrics({ cacheDir, slug, device });

  return [f({
    id: 'cwv-report',
    severity: 'info',
    category: 'performance',
    title: `Core Web Vitals analysis (${device})`,
    description: summaryText.slice(0, 4000),
    recommendation: `Full report saved to projects/${path.basename(projectDir)}/cwv/${latest}`,
    evidence: [{ file: `cwv/${latest}`, url: config.site }],
    ...(metrics.length ? { metrics } : {}),
  })];
}

async function readCwvMetrics({ cacheDir, slug, device }) {
  try {
    const psi = JSON.parse(await readFile(path.join(cacheDir, `${slug}.${device}.psi.json`), 'utf8'));
    const audits = psi?.data?.lighthouseResult?.audits || {};
    const fieldMetrics = psi?.data?.loadingExperience?.metrics || {};
    const num = (k) => audits?.[k]?.numericValue;

    const lcpField = fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    const clsField = fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    const inpField = fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile;
    const ttfbField = fieldMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE?.percentile;

    const out = [];
    const push = (key, label, value, unit, thresholds, direction = 'lower-is-better') => {
      if (value == null || Number.isNaN(value)) return;
      out.push({ key, label, value, unit, thresholds, direction });
    };
    const perfScore = psi?.data?.lighthouseResult?.categories?.performance?.score;
    if (perfScore != null) {
      out.push({
        key: 'lhs-perf',
        label: 'Perf',
        value: perfScore * 100,
        unit: 'score',
        thresholds: { good: 90, poor: 50 },
        direction: 'higher-is-better',
        benchmarks: [
          { value: 35, label: 'web median' },
          { value: 95, label: 'EDS target' },
        ],
      });
    }
    push('lcp', 'LCP', lcpField ?? num('largest-contentful-paint'), 'ms', { good: 2500, poor: 4000 });
    push('cls', 'CLS', (clsField != null ? clsField / 100 : num('cumulative-layout-shift')), 'score', { good: 0.1, poor: 0.25 });
    if (inpField != null) push('inp', 'INP', inpField, 'ms', { good: 200, poor: 500 });
    else push('tbt', 'TBT', num('total-blocking-time'), 'ms', { good: 200, poor: 600 });
    push('fcp', 'FCP', num('first-contentful-paint'), 'ms', { good: 1800, poor: 3000 });
    push('ttfb', 'TTFB', ttfbField ?? num('server-response-time'), 'ms', { good: 800, poor: 1800 });
    return out;
  } catch {
    return [];
  }
}
