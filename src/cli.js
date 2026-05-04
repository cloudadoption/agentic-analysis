#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { copyFile, writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  resolveTargets, listProjects, projectDir, loadProjectConfig,
} from './schema/config.js';
import { cloneCode } from './setup/cloneCode.js';
import { cloneContent } from './setup/cloneContent.js';
import { runAnalyzers } from './orchestrator.js';
import { synthesize } from './synthesize.js';
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

  console.log(prefix(slug), `analyzers: ${config.analyzers.join(', ')}`);
  const findings = await runAnalyzers({
    config,
    projectDir: dir,
    onEvent: (e) => console.log(prefix(slug), 'event', e),
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
