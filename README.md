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
| `seo` | Deterministic checks: `<title>`, meta description, canonical, OG/Twitter tags, `<html lang>`, headings, image alt, JSON-LD, `robots.txt`, `sitemap.xml`. | `fetch` + cheerio |
| `security` | Deterministic checks: response headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), HTTPS enforcement, server fingerprinting, plus `npm audit` if `code/package-lock.json` exists. | `fetch` + npm |
| `accessibility` | Headless `axe-core` scan of each URL listed in `accessibility.pages`. Renders the page in Chromium, runs the full axe ruleset, emits one finding per violation with affected nodes. | Puppeteer + @axe-core/puppeteer |
| `cwv` | Vendored [ramboz/cwv-agent](https://github.com/ramboz/cwv-agent) — multi-agent CWV / performance analysis using PSI, HAR, code coverage, and rules. Emits a summary finding pointing at the full markdown report. | Vendored cwv-agent (LangChain + Gemini) |

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
```

Common options for `setup` / `run` / `render`:
- `-p, --project <slug>` — repeatable; selects which project(s) to operate on.
- `-a, --all` — operate on every project.
- `--skip-setup` *(run only)* — skip the clone step.
- `--refresh` *(setup, run)* — force a fresh git fetch / content sync.
- `--no-open` *(run, render)* — do not open the HTML report when done.

If only one project exists, `--project` / `--all` is optional. With multiple projects, you must pick. Multi-project runs are sequential with `[<slug>]`-prefixed logs; one failing does not abort the rest (process exits non-zero at the end if any failed).

## Config

`projects/<slug>/audit.config.json` (template at `audit.config.example.json` in the repo root):

| Field | Description |
|---|---|
| `customer` | Customer / project name (shown in the report header). |
| `site` | Production site URL (used by `seo`, `security`, `accessibility`, `cwv`). |
| `source.code.repo` | Git URL of the customer's EDS code repo. |
| `source.code.ref` | Branch / tag / SHA to clone (default `main`). Cloned with `--depth=1`. |
| `content.source` | `da` (default) / `rclone` / `local` / `manual` / `none`. See examples below. |
| `analyzers` | Array of analyzer names. Order is irrelevant — analyzers fan out in parallel. |
| `output` | Array of renderer names: `json`, `html`, `md`, `pdf`. |
| `cwv.device` | `mobile` (default) or `desktop`. |
| `cwv.action` | cwv-agent action (default `agent`). |
| `cwv.model` | Override cwv-agent model (e.g. `gemini-2.5-pro`). |
| `cwv.skipCache` | `true` to force fresh CWV data collection. |
| `accessibility.pages` | Array of paths to scan with axe (default `["/"]`). |

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

After any source produces `.docx` files in `projects/<slug>/content/`, they are automatically converted to `.md` siblings via `@adobe/helix-docx2md` so the `contentModel` analyzer reads markdown.

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

## Troubleshooting

- **`BEDROCK_API_KEY is not set`** — `cp .env.example .env`, set the key.
- **`Bedrock 403`** — your key lacks access to `BEDROCK_MODEL_ID`. Confirm via Bedrock console.
- **`Bedrock 400 ... prompt is too long`** — the agent loop should prevent this; if you see it, an analyzer's loaded skill files may be too large. Open an issue.
- **`aem content clone` fails / 403** — that command is **DA-only**. For SharePoint / Drive / etc., use `rclone` or `local` content sources instead.
- **`rclone: command not found`** — `brew install rclone`, then `rclone config` to add a remote.
- **CWV: "API key not valid"** — could mean the URL has no CrUX data (404 misreported as 401), the key is restricted, or the CrUX API isn't enabled on the key's GCP project. Test with: `curl -s -X POST "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=$KEY" -H 'Content-Type: application/json' -d '{"url":"https://example.com","formFactor":"PHONE"}'`.
- **CWV: "gemini.json does not exist"** — `GOOGLE_APPLICATION_CREDENTIALS` is being resolved relative to the cwv-agent vendor dir. Use an **absolute path** in `.env`.
- **Puppeteer fails to launch** — `npx puppeteer browsers install chrome` to refresh the bundled Chromium.

## Updating the vendored cwv-agent

See `src/analyzers/cwv/VENDOR.md` for the procedure (re-clone from upstream, copy with rsync, update SHA + date in that file).
