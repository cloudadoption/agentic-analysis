import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export const meta = { name: 'security', skills: [], tools: [] };

const UA = 'agentic-analysis/2.0 (+https://github.com/adobe)';

function f(partial) {
  return { analyzer: 'security', severity: 'info', category: 'security', evidence: [], ...partial };
}

async function fetchHead(url) {
  const res = await fetch(url, { method: 'GET', headers: { 'user-agent': UA }, redirect: 'follow' });
  return { ok: res.ok, status: res.status, url: res.url, headers: res.headers };
}

const HEADER_CHECKS = [
  { name: 'strict-transport-security', label: 'HSTS', sev: 'warning', why: 'Forces HTTPS and mitigates SSL stripping attacks.' },
  { name: 'content-security-policy', label: 'Content-Security-Policy', sev: 'warning', why: 'Mitigates XSS by restricting allowed sources for scripts/styles/etc.' },
  { name: 'x-content-type-options', label: 'X-Content-Type-Options', sev: 'info', why: 'Prevents MIME-sniffing (should be `nosniff`).' },
  { name: 'x-frame-options', label: 'X-Frame-Options', sev: 'info', why: 'Mitigates clickjacking (use SAMEORIGIN/DENY or CSP frame-ancestors).' },
  { name: 'referrer-policy', label: 'Referrer-Policy', sev: 'info', why: 'Controls how much referer info leaks to other origins.' },
  { name: 'permissions-policy', label: 'Permissions-Policy', sev: 'info', why: 'Restricts browser features (camera, geolocation, etc.).' },
];

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts);
    let out = '', err = '';
    p.stdout?.on('data', (d) => { out += d.toString(); });
    p.stderr?.on('data', (d) => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

export async function run({ config, projectDir }) {
  const findings = [];
  const site = config.site.replace(/\/$/, '');

  let head;
  try { head = await fetchHead(site); }
  catch (e) {
    return [f({ id: 'sec-home-unreachable', severity: 'critical', title: `Homepage unreachable (${e.message})`, evidence: [{ url: site }] })];
  }

  if (!head.url.startsWith('https://')) {
    findings.push(f({ id: 'sec-no-https', severity: 'critical', title: 'Homepage not served over HTTPS', description: `Final URL after redirects: ${head.url}.`, evidence: [{ url: site }] }));
  }

  for (const check of HEADER_CHECKS) {
    const value = head.headers.get(check.name);
    if (!value) {
      findings.push(f({
        id: `sec-header-missing-${check.name}`,
        severity: check.sev,
        title: `Missing ${check.label} response header`,
        description: check.why,
        evidence: [{ url: head.url }],
      }));
    } else {
      findings.push(f({
        id: `sec-header-present-${check.name}`,
        severity: 'success',
        title: `${check.label} header present`,
        description: '',
        evidence: [{ url: head.url, excerpt: value.length > 200 ? value.slice(0, 200) + '…' : value }],
      }));
    }
  }

  const server = head.headers.get('server');
  const xPoweredBy = head.headers.get('x-powered-by');
  if (server) {
    findings.push(f({ id: 'sec-server-disclosure', severity: 'info', title: `Server header discloses: ${server}`, description: 'Consider stripping or generalizing the Server header.', evidence: [{ url: head.url }] }));
  }
  if (xPoweredBy) {
    findings.push(f({ id: 'sec-x-powered-by', severity: 'info', title: `X-Powered-By header discloses: ${xPoweredBy}`, description: 'Strip the X-Powered-By header to reduce fingerprinting.', evidence: [{ url: head.url }] }));
  }

  const codeDir = path.join(projectDir, 'code');
  const pkgPath = path.join(codeDir, 'package.json');
  let hasPkg = false;
  try { await stat(pkgPath); hasPkg = true; } catch {}
  if (hasPkg) {
    const lockExists = await stat(path.join(codeDir, 'package-lock.json')).then(() => true).catch(() => false);
    if (!lockExists) {
      findings.push(f({ id: 'sec-no-lockfile', severity: 'info', title: 'No package-lock.json in code repo', description: 'Lockfiles pin transitive deps and are required for `npm audit`.', evidence: [{ file: 'code/package.json' }] }));
    } else {
      try {
        const { code, out } = await runCmd('npm', ['audit', '--json', '--audit-level=low'], { cwd: codeDir });
        const audit = JSON.parse(out || '{}');
        const meta = audit.metadata?.vulnerabilities || {};
        const total = (meta.critical || 0) + (meta.high || 0) + (meta.moderate || 0) + (meta.low || 0);
        if (total === 0) {
          findings.push(f({ id: 'sec-npm-audit-clean', severity: 'success', title: 'npm audit reports no vulnerabilities', description: '' }));
        } else {
          const sev = (meta.critical || 0) > 0 ? 'critical' : (meta.high || 0) > 0 ? 'warning' : 'info';
          findings.push(f({
            id: 'sec-npm-audit-vulns',
            severity: sev,
            title: `npm audit: ${total} vulnerabilities (critical=${meta.critical || 0}, high=${meta.high || 0}, moderate=${meta.moderate || 0}, low=${meta.low || 0})`,
            description: 'Run `npm audit fix` (or review breaking changes) to resolve.',
            evidence: [{ file: 'code/package-lock.json' }],
          }));
        }
      } catch (e) {
        findings.push(f({ id: 'sec-npm-audit-failed', severity: 'info', title: 'npm audit failed', description: e.message }));
      }
    }
  }

  return findings;
}
