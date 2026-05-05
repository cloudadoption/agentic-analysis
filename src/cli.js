#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { copyFile, writeFile, readFile, mkdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  resolveTargets, listProjects, projectDir, loadProjectConfig,
} from './schema/config.js';
import { cloneCode } from './setup/cloneCode.js';
import { cloneContent } from './setup/cloneContent.js';
import { runAnalyzers } from './orchestrator.js';
import { synthesize } from './synthesize.js';
import { invalidate, listCached } from './cache.js';
import { publish } from './publish.js';
import { listPublished } from './list-published.js';
import { render } from './renderers/index.js';
import { listAnalyzers } from './analyzers/index.js';

const repoRoot = process.cwd();
const program = new Command();

const collect = (val, prev) => prev.concat([val]);

program
  .name('audit')
  .description('Agentic analysis for AEM Edge Delivery Services projects')
  .version('2.0.0-alpha.0');

program
  .command('init <slug>')
  .description('Scaffold a new project at projects/<slug>/audit.config.json')
  .action(async (slug) => {
    const dir = projectDir(repoRoot, slug);
    const dst = path.join(dir, 'audit.config.json');
    try { await stat(dst); console.error(`${dst} already exists.`); process.exit(1); } catch {}
    await mkdir(dir, { recursive: true });
    const src = path.join(repoRoot, 'audit.config.example.json');
    await copyFile(src, dst);
    console.log(`Wrote ${dst}. Edit it, then run \`audit setup --project ${slug}\` and \`audit run --project ${slug}\`.`);
  });

program
  .command('clean')
  .description('Remove generated artifacts (code/, content/, .cache/, findings.json, report.*, cwv/) and reset the project for a full clean run. audit.config.json is preserved.')
  .option('-p, --project <slug>', 'project slug (repeatable)', collect, [])
  .option('-a, --all', 'clean every project', false)
  .option('-y, --yes', 'skip the confirmation prompt', false)
  .action(async (opts) => {
    const targets = await resolveTargets(repoRoot, { slugs: opts.project, all: opts.all });
    const ARTIFACTS = ['code', 'content', '.cache', 'cwv', 'findings.json', 'report.html', 'report.md', 'report.pdf'];

    const plan = [];
    for (const t of targets) {
      const present = [];
      for (const a of ARTIFACTS) {
        const p = path.join(t.dir, a);
        try { await stat(p); present.push(a); } catch {}
      }
      plan.push({ slug: t.slug, dir: t.dir, present });
    }

    console.log('The following artifacts will be removed:');
    for (const p of plan) {
      console.log(`  ${prefix(p.slug)} ${p.dir}`);
      if (p.present.length) p.present.forEach((a) => console.log(`      - ${a}`));
      else console.log('      (nothing to clean)');
    }
    console.log('audit.config.json is preserved.');

    if (!opts.yes) {
      const ok = await confirm('Proceed? [y/N] ');
      if (!ok) { console.log('Aborted.'); process.exit(0); }
    }

    for (const p of plan) {
      for (const a of p.present) {
        await rm(path.join(p.dir, a), { recursive: true, force: true });
      }
      console.log(prefix(p.slug), `cleaned ${p.present.length} item(s)`);
    }
  });

program
  .command('publish')
  .description('Upload generated reports to Cloudflare R2 under an unguessable URL. URLs auto-expire after 90 days. Re-publish overwrites the existing hash for the project.')
  .option('-p, --project <slug>', 'project slug (repeatable)', collect, [])
  .option('-a, --all', 'publish every project', false)
  .action(async (opts) => {
    const targets = await resolveTargets(repoRoot, { slugs: opts.project, all: opts.all });
    let failed = 0;
    for (const t of targets) {
      try {
        console.log(prefix(t.slug), 'publishing…');
        const { urls, expiresAt, uploaded } = await publish({ projectDir: t.dir, slug: t.slug, config: t.config });
        console.log(prefix(t.slug), `✓ uploaded ${uploaded.length} file(s); expires ${expiresAt}`);
        Object.entries(urls).forEach(([k, v]) => console.log(`    ${k.padEnd(15)} ${v}`));
      } catch (e) {
        failed++;
        console.error(prefix(t.slug), `✗ ${e.message}`);
      }
    }
    if (failed) process.exit(1);
  });

program
  .command('list-published')
  .description('List reports published to Cloudflare R2, with their unguessable URLs and expiry status.')
  .option('--active', 'show only non-expired reports', false)
  .action(async (opts) => {
    const records = await listPublished({ activeOnly: opts.active });
    if (!records.length) {
      console.log('No published reports.');
      return;
    }
    for (const r of records) {
      const status = r.expired ? '⛔ EXPIRED' : `expires in ${r.daysRemaining}d (${r.expiresAt})`;
      console.log(`${r.project}${r.customer ? `  (${r.customer})` : ''}`);
      console.log(`  ${r.url}`);
      console.log(`  Published ${r.publishedAt}  ·  ${status}`);
      if (r.site) console.log(`  Site: ${r.site}`);
      console.log('');
    }
  });

program
  .command('list-projects')
  .description('List configured projects')
  .action(async () => {
    const slugs = await listProjects(repoRoot);
    if (!slugs.length) console.log('(none — run `audit init <slug>`)');
    else slugs.forEach((s) => console.log(s));
  });

program
  .command('list-analyzers')
  .description('List available analyzers')
  .action(() => listAnalyzers().forEach((n) => console.log(n)));

program
  .command('setup')
  .description('Clone code and content for one or more projects')
  .option('-p, --project <slug>', 'project slug (repeatable)', collect, [])
  .option('-a, --all', 'run for all projects', false)
  .option('--refresh', 'refresh existing clones', false)
  .action(async (opts) => {
    const targets = await resolveTargets(repoRoot, { slugs: opts.project, all: opts.all });
    for (const t of targets) await setupOne(t, opts.refresh);
  });

program
  .command('run')
  .description('Run analyzers and render outputs for one or more projects')
  .option('-p, --project <slug>', 'project slug (repeatable)', collect, [])
  .option('-a, --all', 'run for all projects', false)
  .option('--skip-setup', 'skip clone step', false)
  .option('--refresh', 'force refresh of clones', false)
  .option('-r, --rerun <name>', 'invalidate cache for an analyzer (repeatable; "all" clears every analyzer)', collect, [])
  .option('--no-open', 'do not open the HTML report when done')
  .action(async (opts) => {
    const targets = await resolveTargets(repoRoot, { slugs: opts.project, all: opts.all });
    let failed = 0;
    for (const t of targets) {
      try { await runOne(t, opts); }
      catch (e) { failed++; console.error(prefix(t.slug), `failed: ${e.message}`); }
    }
    if (failed) process.exit(1);
  });

program
  .command('render')
  .description('Re-render outputs from existing findings.json (one or many projects)')
  .option('-p, --project <slug>', 'project slug (repeatable)', collect, [])
  .option('-a, --all', 'run for all projects', false)
  .option('--no-open', 'do not open the HTML report when done')
  .action(async (opts) => {
    const targets = await resolveTargets(repoRoot, { slugs: opts.project, all: opts.all });
    for (const t of targets) await renderOne(t, opts);
  });

function prefix(slug) { return `[${slug}]`; }

function shortInput(input) {
  const s = JSON.stringify(input || {});
  return s.length > 80 ? s.slice(0, 77) + '…' : s;
}

function confirm(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (input) => {
      const answer = input.trim().toLowerCase();
      resolve(answer === 'y' || answer === 'yes');
      process.stdin.pause();
    });
  });
}

function openInBrowser(filePath) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', filePath] : [filePath];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

async function setupOne({ slug, dir, config }, refresh) {
  console.log(prefix(slug), `cloning code from ${config.source.code.repo}#${config.source.code.ref}`);
  await cloneCode({ projectDir: dir, source: config.source.code, refresh });
  console.log(prefix(slug), `cloning content (source: ${config.content.source})`);
  await cloneContent({ projectDir: dir, contentConfig: config.content });
}

async function runOne({ slug, dir, config }, opts) {
  if (!opts.skipSetup) await setupOne({ slug, dir, config }, opts.refresh);

  if (opts.rerun?.length) {
    const targets = opts.rerun.includes('all') ? 'all' : opts.rerun;
    await invalidate(dir, targets);
    console.log(prefix(slug), `cache invalidated: ${targets === 'all' ? 'all' : targets.join(', ')}`);
  }

  const cached = await listCached(dir);
  if (cached.length) console.log(prefix(slug), `cache hits available: ${cached.join(', ')} (use --rerun to redo)`);

  console.log(prefix(slug), `analyzers: ${config.analyzers.join(', ')}`);
  const findings = await runAnalyzers({
    config,
    projectDir: dir,
    onEvent: (e) => {
      if (e.type === 'analyzer:start') console.log(prefix(slug), `▶ ${e.name}`);
      else if (e.type === 'analyzer:done') console.log(prefix(slug), `✓ ${e.name} (${e.count} findings)`);
      else if (e.type === 'analyzer:cached') console.log(prefix(slug), `↻ ${e.name} (${e.count} findings, cached ${e.cachedAt})`);
      else if (e.type === 'analyzer:error') console.log(prefix(slug), `✗ ${e.name}: ${e.error}`);
      else if (e.type === 'turn') console.log(prefix(slug), `  ${e.analyzer} turn=${e.turn} stop=${e.stopReason}${e.usage ? ` tokens=${e.usage.inputTokens || '?'}/${e.usage.outputTokens || '?'}` : ''}`);
      else if (e.type === 'tool') console.log(prefix(slug), `  ${e.analyzer} → ${e.name}(${shortInput(e.input)})`);
      else if (e.type === 'budget-exhausted') console.log(prefix(slug), `  ${e.analyzer} budget exhausted at turn ${e.turn}, finalizing`);
      else if (e.type === 'finalize') console.log(prefix(slug), `  ${e.analyzer} finalize${e.usage ? ` tokens=${e.usage.inputTokens || '?'}/${e.usage.outputTokens || '?'}` : ''}`);
    },
  });

  console.log(prefix(slug), `synthesizing summary…`);
  let synthesis;
  try { synthesis = await synthesize({ findings }); }
  catch (e) {
    console.warn(prefix(slug), `synthesis failed: ${e.message}`);
    synthesis = { summary: '(synthesis failed — see logs)', topPriorities: [], categories: {} };
  }

  await writeFile(path.join(dir, 'findings.json'), JSON.stringify({ slug, synthesis, findings }, null, 2));

  console.log(prefix(slug), `render: ${config.output.join(', ')}`);
  const written = await render(config.output, { findings, synthesis, config, projectDir: dir, slug });
  written.forEach((p) => console.log(prefix(slug), `  -> ${p}`));
  if (opts.open) openHtml(written, slug);
}

async function renderOne({ slug, dir, config }, opts = {}) {
  const raw = await readFile(path.join(dir, 'findings.json'), 'utf8');
  const { findings, synthesis } = JSON.parse(raw);
  const written = await render(config.output, { findings, synthesis, config, projectDir: dir, slug });
  written.forEach((p) => console.log(prefix(slug), `  -> ${p}`));
  if (opts.open) openHtml(written, slug);
}

function openHtml(written, slug) {
  const html = written.find((p) => p.endsWith('.html'));
  if (!html) {
    console.warn(prefix(slug), '--open: no HTML output produced (add "html" to config.output).');
    return;
  }
  console.log(prefix(slug), `opening ${html}`);
  openInBrowser(html);
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
