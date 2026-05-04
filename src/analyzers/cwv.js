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

  return [f({
    id: 'cwv-report',
    severity: 'info',
    category: 'performance',
    title: `Core Web Vitals analysis (${device})`,
    description: summaryText.slice(0, 4000),
    recommendation: `Full report saved to projects/${path.basename(projectDir)}/cwv/${latest}`,
    evidence: [{ file: `cwv/${latest}`, url: config.site }],
  })];
}
