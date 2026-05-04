import puppeteer from 'puppeteer';
import { AxePuppeteer } from '@axe-core/puppeteer';

export const meta = { name: 'accessibility', skills: [], tools: [] };

function f(partial) {
  return { analyzer: 'accessibility', severity: 'info', category: 'accessibility', evidence: [], ...partial };
}

const IMPACT_TO_SEVERITY = { critical: 'warning', serious: 'warning', moderate: 'warning', minor: 'info' };

async function auditPage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    const results = await new AxePuppeteer(page).analyze();
    return results;
  } finally {
    await page.close();
  }
}

function violationsToFindings(url, violations) {
  return violations.map((v) => f({
    id: `a11y-${v.id}-${encodeURIComponent(url)}`.slice(0, 200),
    severity: IMPACT_TO_SEVERITY[v.impact] || 'info',
    category: 'accessibility',
    title: `${v.help} (${v.impact || 'unknown'})`,
    description: `${v.description}\n\nAffected nodes: ${v.nodes.length}.`,
    recommendation: v.helpUrl,
    evidence: v.nodes.slice(0, 5).map((n) => ({
      url,
      excerpt: (n.html || '').slice(0, 300),
      file: Array.isArray(n.target) ? n.target.join(' ') : '',
    })),
  }));
}

export async function run({ config }) {
  const site = config.site.replace(/\/$/, '');
  const paths = (config.accessibility?.pages && config.accessibility.pages.length) ? config.accessibility.pages : ['/'];
  const findings = [];

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  } catch (e) {
    return [f({
      id: 'a11y-puppeteer-failed',
      severity: 'warning',
      title: 'Failed to launch headless browser for accessibility checks',
      description: `${e.message}. Try \`npx puppeteer browsers install chrome\`.`,
    })];
  }

  try {
    let totalChecked = 0;
    let totalViolations = 0;

    for (const p of paths) {
      const url = `${site}${p.startsWith('/') ? p : `/${p}`}`;
      try {
        const results = await auditPage(browser, url);
        totalChecked++;
        totalViolations += results.violations.length;
        findings.push(...violationsToFindings(url, results.violations));

        if (results.violations.length === 0) {
          findings.push(f({
            id: `a11y-clean-${encodeURIComponent(url)}`.slice(0, 200),
            severity: 'success',
            title: `axe-core: 0 violations on ${url}`,
            description: `${results.passes.length} rules passed.`,
            evidence: [{ url }],
          }));
        }
      } catch (err) {
        findings.push(f({
          id: `a11y-page-failed-${encodeURIComponent(url)}`.slice(0, 200),
          severity: 'warning',
          title: `Failed to audit ${url}`,
          description: err.message,
          evidence: [{ url }],
        }));
      }
    }

    findings.push(f({
      id: 'a11y-summary',
      severity: totalViolations > 0 ? 'info' : 'success',
      title: `Accessibility scan: ${totalChecked} page(s), ${totalViolations} violation(s)`,
      description: `Headless axe-core scan against ${paths.length} configured page(s).`,
    }));
  } finally {
    await browser.close();
  }

  return findings;
}
