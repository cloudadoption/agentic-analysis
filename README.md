# agentic-analysis

Single-command, multi-dimensional audit tool for AEM Edge Delivery Services projects. Runs a suite of analyzers against a customer's code and content, synthesizes the findings into an executive summary with actionable recommendations, and renders a categorized HTML dashboard plus structured JSON.

```bash
node src/cli.js init <slug>      # scaffold a new project
node src/cli.js run --project <slug>   # clone, analyze, synthesize, render, open
```

## Analyzers

| Analyzer | What it does | Source |
|---|---|---|
| `codeQuality` | Audits the customer's code repo (`code/`) against `building-blocks` and `testing-blocks` skills using a Claude agent loop with file-read tools. Returns mixed-severity findings (warnings, info, success). | Bedrock (Claude) |
| `contentModel` | Audits content (`content/`) against the `content-modeling` skill. `.docx` files are auto-converted to `.md` via `@adobe/helix-docx2md` during setup. | Bedrock (Claude) |
| `seo` | Deterministic checks: `<title>`, meta description, canonical, OG/Twitter tags, `<html lang>`, headings, image alt, JSON-LD, `robots.txt`, `sitemap.xml`, plus generative-AI crawler accessibility (training vs. answer-engine bot policy in `robots.txt`, `ai.txt`, `llms.txt`, `noai` headers/meta — see `.claude/skills/genai-crawler-accessibility/`). | `fetch` + cheerio |
| `security` | Deterministic checks: response headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), HTTPS enforcement, server fingerprinting, plus `npm audit` if `code/package-lock.json` exists. | `fetch` + npm |
| `accessibility` | Headless `axe-core` scan of each URL listed in `accessibility.pages`. Renders the page in Chromium, runs the full axe ruleset, emits one finding per violation with affected nodes. | Puppeteer + @axe-core/puppeteer |
| `cwv` | Vendored [ramboz/cwv-agent](https://github.com/ramboz/cwv-agent) — multi-agent CWV / performance analysis using PSI, HAR, code coverage, and rules. Emits a summary finding pointing at the full markdown report, plus structured metrics (LCP / CLS / INP-or-TBT / FCP / TTFB and the Lighthouse performance score) extracted from the PSI cache and rendered as an inline chart in the HTML report. | Vendored cwv-agent (LangChain + Gemini) |
| `publishStatus` | Verifies that what EDS thinks is published actually serves on the customer's prod URL. Pulls `query-index.json` from `eds.liveUrl`, cross-references with `<site>/sitemap.xml`, then samples paths and compares status codes + `<main>` markup hash on both URLs. Flags routing failures, CDN drift, draft leakage. | `fetch` + cheerio |

After all analyzers complete, a **synthesis** step makes one Bedrock call to produce:
- a 2–4 sentence executive summary,
- a top-priorities list (3–5 imperative next steps),
- a per-category insight + recommendation paragraph.

The synthesis powers the executive header and category sections of the HTML report.

## Quick start

1. **Install prerequisites** — see [INSTALL.md](INSTALL.md).
2. **Configure secrets:**
   ```bash
   cp .env.example .env
   # at minimum, set BEDROCK_API_KEY
   # for the cwv analyzer, also set the Google keys (see INSTALL.md)
   ```
3. **Install JS deps** (also downloads Chromium for headless a11y; ~170 MB once):
   ```bash
   npm install
   ```
4. **Scaffold a project:**
   ```bash
   node src/cli.js init acme
   # edit projects/acme/audit.config.json
   ```
5. **Run:**
   ```bash
   node src/cli.js run --project acme
   ```
   The HTML report opens in your browser. Pass `--no-open` to suppress.

## Project layout

Each customer is a **project** under `projects/<slug>/`, fully isolated.

```
projects/
└── acme/
    ├── audit.config.json    # per-project config
    ├── code/                # cloned via git
    ├── content/             # cloned via DA / rclone / local / manual
    ├── findings.json        # raw output: { findings, synthesis }
    ├── report.html          # categorized dashboard
    └── cwv/                 # cwv-agent's full markdown report (when cwv runs)
```

## Commands

```bash
node src/cli.js init <slug>             # scaffold projects/<slug>/audit.config.json
node src/cli.js list-projects           # list configured projects
node src/cli.js list-analyzers          # list available analyzers

node src/cli.js setup [opts]            # clone code + content
node src/cli.js run [opts]              # setup + analyzers + synthesize + render
node src/cli.js render [opts]           # re-render from existing findings.json (no re-run)
node src/cli.js clean [opts]            # delete generated artifacts; keep audit.config.json
node src/cli.js publish [opts]          # upload reports to Cloudflare R2 under an unguessable URL (90-day expiry)
node src/cli.js list-published [opts]   # list reports currently in R2 with their URLs + expiry status
```

Common options for `setup` / `run` / `render` / `clean`:
- `-p, --project <slug>` — repeatable; selects which project(s) to operate on.
- `-a, --all` — operate on every project.
- `--skip-setup` *(run only)* — skip the clone step.
- `--refresh` *(setup, run)* — force a fresh git fetch / content sync.
- `--rerun <name>` *(run only)* — invalidate the cached findings for one analyzer (repeatable; `--rerun all` invalidates everything for the project).
- `--fresh <name>` *(run only)* — also bust the analyzer's upstream third-party cache, then `--rerun`. For `cwv`, deletes the vendor cwv-agent cache files (`src/analyzers/cwv/vendor/.cache/<host>.<device>.*`) so the next run hits PSI / CrUX / Lighthouse fresh. Useful when PSI returned an incomplete lab run (e.g. `null` performance score).
- `--no-open` *(run, render)* — do not open the HTML report when done.
- `-y, --yes` *(clean only)* — skip the y/N confirmation prompt.

### Caching

After each successful analyzer run, its findings are cached to `projects/<slug>/.cache/<analyzer>.json`. The next `audit run` reuses the cache (logged as `↻ <analyzer> (cached …)`) so you only re-pay for analyzers you actually change. Failed analyzers don't cache, so they retry automatically. Use `--rerun <name>` to force a fresh run for one, or `clean` to wipe everything and start over.

### Report visuals

The HTML report includes two inline-SVG charts above the findings table when the data is available:

- **Core Web Vitals chart** — horizontal bars for LCP, CLS, INP (or TBT fallback), FCP, TTFB, colored against Google's good / needs-improvement / poor thresholds. CrUX field data is preferred when available; falls back to Lighthouse lab values. The Lighthouse **performance score (0–100)** renders as a separate row with a continuous red→yellow→green gradient track, a marker at the score's position, and dashed reference ticks at the web median (≈35) and EDS target (95). When PSI returns no overall performance score, the row is omitted and a `cwv-perf-score-unavailable` info finding is emitted explaining the gap.
- **Analyzer × severity heatmap** — at-a-glance grid showing where findings are concentrated across analyzers and severities.

Both charts are self-contained SVG (no external deps) and print-friendly in the PDF renderer.

### Online delivery

`audit publish --project <slug>` uploads `report.html`, `report.pdf`, `report.md`, and `findings.json` to Cloudflare R2 under a 32-byte unguessable hash. The companion Worker at https://audit.bbird.live serves the files (and a tiny landing page at `/<hash>/`) with `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallowing everything. URLs auto-expire 90 days after publish. Re-publishing overwrites the same hash, so URLs stay stable across re-runs. To rotate, delete `projects/<slug>/.published.json` before publishing. One-time setup is in [cloudflare/README.md](cloudflare/README.md).

If only one project exists, `--project` / `--all` is optional. With multiple projects, you must pick. Multi-project runs are sequential with `[<slug>]`-prefixed logs; one failing does not abort the rest (process exits non-zero at the end if any failed).

## Config

`projects/<slug>/audit.config.json` (template at `audit.config.example.json` in the repo root):

| Field | Description |
|---|---|
| `customer` | Customer / project name (shown in the report header). |
| `site` | Production site URL (used by `seo`, `security`, `accessibility`, `cwv`). |
| `source.code.repo` | Git URL of the customer's EDS code repo. Mutually exclusive with `source.code.path`. |
| `source.code.ref` | Branch / tag / SHA to clone (default `main`). Cloned with `--depth=1`. |
| `source.code.path` | Absolute or `~`-relative path to a local code snapshot. When set, the code is rsynced (with `--delete`) into `projects/<slug>/code/` instead of being cloned from GitHub. `repo` / `ref` are ignored. `node_modules`, `.cache`, `.DS_Store` are excluded. |
| `content.source` | `da` (default) / `rclone` / `local` / `manual` / `none`. See examples below. |
| `analyzers` | Array of analyzer names. Order is irrelevant — analyzers fan out in parallel. |
| `output` | Array of renderer names: `json`, `html`, `md`, `pdf`. |
| `cwv.device` | `mobile` (default) or `desktop`. |
| `cwv.action` | cwv-agent action (default `agent`). |
| `cwv.model` | Override cwv-agent model (e.g. `gemini-2.5-pro`). |
| `cwv.skipCache` | `true` to force fresh CWV data collection. |
| `accessibility.pages` | Array of paths to scan with axe (default `["/"]`). |
| `eds.liveUrl` | EDS live URL (e.g. `https://main--<repo>--<owner>.aem.live`). Auto-derived from `source.code.repo` if absent. |
| `eds.previewUrl` | EDS preview URL (`.aem.page`). Auto-derived if absent. Currently advisory; not consumed by any analyzer. |
| `eds.queryIndexPath` | Path to query-index on EDS live (default `/query-index.json`). |
| `publishStatus.sampleSize` | Number of paths to sample when comparing prod vs EDS live (default `10`). |

### Content source examples

```jsonc
// DA-based site (helix-cli `aem content clone --all`, runs from inside cloned code repo)
"content": { "source": "da" }

// rclone-based — SharePoint / OneDrive / Google Drive / S3 / etc.
"content": {
  "source": "rclone",
  "remote": "customer-sp",        // rclone remote name (one-time `rclone config`)
  "path": "Sites/Marketing/Documents",
  "include": ["**/*.docx", "**/*.xlsx"],
  "exclude": []
}

// Local folder — e.g. OneDrive desktop-synced SharePoint library
"content": {
  "source": "local",
  "path": "~/Library/CloudStorage/OneDrive-Adobe/.../<sp-folder>"
}

// Manual — you drop content into projects/<slug>/content/ yourself
"content": { "source": "manual" }

// Skip content entirely (code-only audits)
"content": { "source": "none" }
```

After any source produces `.docx` files in `projects/<slug>/content/`, they are automatically converted to `.md` siblings via `@adobe/helix-docx2md` so the `contentModel` analyzer reads markdown. After conversion, the `.docx` original is **deleted from the project**, and a manifest at `projects/<slug>/.cache/docx2md-manifest.json` records what's been converted plus the source mtime. On subsequent syncs:

- A `--exclude-from` list keeps rsync from re-fetching already-converted `.docx` files.
- If you edit a doc upstream (mtime advances), the manifest entry is invalidated and the file is re-fetched + re-converted on the next setup.
- If you delete a `.md` from `content/`, the manifest also invalidates so the next setup brings the source back and reconverts it.

Net effect: a 19 GB OneDrive content tree settles to ~500 MB on disk after first conversion, and subsequent syncs only transfer changed files.

The `local` strategy also skips binary assets by default — images (`png`, `jpg`, `webp`, `svg`, `gif`, `heic`, …), video (`mp4`, `mov`, `webm`, …), audio, archives (`zip`, `tar`, …), design files (`psd`, `ai`, `sketch`, `fig`, …), and `pdf`. None of the analyzers consume these (they read `.md` or hit live URLs), so excluding them shrinks the sync substantially. If you genuinely need one of these in `content/`, list it in `content.include` (user includes are matched before the binary excludes, first-match wins).

### SharePoint-backed content (Adobe-managed tenants)

If the customer authors in SharePoint, the recommended path is `local`, not direct API access. SharePoint sync via Microsoft Graph requires `Files.Read.All` + `Sites.Read.All` (or `Sites.Selected`), and **Adobe's tenant gates both of these behind admin consent for delegated *and* application permissions** — there is no self-consent path. `rclone` against SharePoint via OAuth has the same limitation (the underlying app registration would need the same permissions).

Workaround: enable the OneDrive desktop client to sync the SharePoint library to your Mac, then point the project at the synced folder:

```jsonc
"content": {
  "source": "local",
  "path": "/Users/<you>/Library/CloudStorage/OneDrive-Adobe/<Org>/<repo>"
}
```

The `local` strategy `rsync`s from there into `projects/<slug>/content/` and runs the docx→md conversion. No Graph permissions required, and the content stays current as long as OneDrive is syncing.

## Architecture

```
src/
├── cli.js                  # commander entry: init / setup / run / render / list-*
├── orchestrator.js         # parallel analyzer fan-out, aggregates Finding[]
├── synthesize.js           # post-orchestrator Bedrock call → executive summary + per-category insights
├── bedrock/
│   ├── client.js           # Converse API over fetch, Bearer auth
│   └── agentLoop.js        # tool-use loop with context budget + finalize fallback
├── tools/                  # tools the agent can call: readFile, glob, grep, readDocx
├── analyzers/              # one module per dimension
│   ├── hello.js            # smoke-test analyzer
│   ├── codeQuality.js
│   ├── contentModel.js
│   ├── seo.js
│   ├── security.js
│   ├── accessibility.js
│   └── cwv/
│       ├── (cwv.js)        # spawn-based wrapper
│       ├── VENDOR.md       # upstream SHA + update procedure
│       └── vendor/         # vendored ramboz/cwv-agent snapshot
├── schema/
│   ├── config.js           # zod schema for audit.config.json + project resolver
│   └── finding.js          # zod schema for Finding
├── renderers/
│   ├── json.js             # writes findings.json
│   ├── html.js             # categorized dashboard, sortable / filterable
│   ├── md.js               # markdown report (categorized, with synthesis)
│   └── pdf.js              # prints html via headless Chromium
├── setup/
│   ├── cloneCode.js        # git clone --depth=1
│   ├── cloneContent.js     # dispatches to content/<source>.js
│   └── content/            # da / rclone / local / manual / none + docx2md post-step
└── skills.js               # loads .claude/skills/<name>/SKILL.md into system prompts
```

### Bedrock call shape

The agent loop talks to Bedrock's Converse API directly (no AWS SDK / SigV4):

```
POST https://bedrock-runtime.<region>.amazonaws.com/model/<modelId>/converse
Authorization: Bearer <BEDROCK_API_KEY>
```

Tool schemas come from each tool module's `spec`. Tool results are appended to the message history; if the conversation grows past ~250 KB of characters, the loop prunes prior tool results to placeholders and forces a final JSON-only reply, so a chatty model can't blow the 1M-token context.

## Testing

```bash
npm test
```

Uses [Vitest](https://vitest.dev/). The suite includes:

| Test file | Coverage |
|---|---|
| `src/bedrock/client.test.js` | Endpoint URL builder, missing-key error, live Bedrock connectivity |

The live connectivity test (`connects to Bedrock and gets a valid response`) sends a minimal one-token prompt and asserts a valid response. It skips automatically when `BEDROCK_API_KEY` is not in the environment, so it is safe to run in CI without credentials; the unit tests still pass.

To run the live test locally:
```bash
node --env-file=.env node_modules/.bin/vitest run src/bedrock/client.test.js
```

## Troubleshooting

- **`BEDROCK_API_KEY is not set`** — `cp .env.example .env`, set the key.
- **`Bedrock 403`** — your key lacks access to `BEDROCK_MODEL_ID`. Confirm via Bedrock console.
- **`Bedrock 400 ... prompt is too long`** — the agent loop should prevent this; if you see it, an analyzer's loaded skill files may be too large. Open an issue.
- **`aem content clone` fails / 403** — that command is **DA-only**. For SharePoint / Drive / etc., use `rclone` or `local` content sources instead.
- **`rclone: command not found`** — `brew install rclone`, then `rclone config` to add a remote.
- **`rsync: unrecognized option '--info=progress2'`** — macOS ships rsync 2.6.9; the `local` strategy needs 3.x. `brew install rsync` and ensure `/opt/homebrew/bin` is first on `PATH`.
- **CWV: "API key not valid"** — could mean the URL has no CrUX data (404 misreported as 401), the key is restricted, or the CrUX API isn't enabled on the key's GCP project. Test with: `curl -s -X POST "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=$KEY" -H 'Content-Type: application/json' -d '{"url":"https://example.com","formFactor":"PHONE"}'`.
- **CWV: "gemini.json does not exist"** — `GOOGLE_APPLICATION_CREDENTIALS` is being resolved relative to the cwv-agent vendor dir. Use an **absolute path** in `.env`.
- **Puppeteer fails to launch** — `npx puppeteer browsers install chrome` to refresh the bundled Chromium.

## Updating the vendored cwv-agent

See `src/analyzers/cwv/VENDOR.md` for the procedure (re-clone from upstream, copy with rsync, update SHA + date in that file).
