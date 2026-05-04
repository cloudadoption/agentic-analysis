# Installation

Prerequisites for running `agentic-analysis`. Skip any tool you don't need (e.g. `rclone` is only required if a project uses the `rclone` content source).

## Required for every run

### Node.js 20+

macOS:
```bash
brew install node
```
Other platforms: https://nodejs.org/

Verify:
```bash
node --version    # >= v20
```

### Git

Pre-installed on macOS. Otherwise:
- Linux: `sudo apt-get install git` (or your distro equivalent)
- Windows: https://git-scm.com/download/win

### Bedrock API key

The core analyzers (`codeQuality`, `contentModel`) and the synthesis step call Anthropic's Claude via AWS Bedrock's Converse API. You need a Bedrock API key with access to the model configured in `.env` (default `us.anthropic.claude-sonnet-4-6`).

```bash
cp .env.example .env
# edit .env:
# BEDROCK_API_KEY=...
# BEDROCK_REGION=us-west-2
# BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
```

## JS dependencies

```bash
npm install
```

This pulls everything else, including:
- `@adobe/helix-docx2md` (auto-converts `.docx` → `.md` after content sync)
- `puppeteer` + `@axe-core/puppeteer` (for headless `accessibility` analyzer; downloads Chromium ~170 MB on first install)
- The full vendored cwv-agent dep tree (LangChain, OpenAI / Google AI / AWS SDKs, etc.)

If Chromium fails to download or stays stale, refresh it explicitly:
```bash
npx puppeteer browsers install chrome
```

## Per-content-source prerequisites

Pick whichever your projects use. You can skip the rest.

### `da` — Document Authoring sites

Install `@adobe/helix-cli` and authenticate once:

```bash
npm i -g @adobe/helix-cli
aem login         # browser-based OAuth
```

The audit tool then runs `aem content clone --all` from inside the cloned code repo. **Note:** `aem content clone` only works for DA-based sites. Sites that author in SharePoint / Google Drive directly should use `rclone` or `local`.

### `rclone` — SharePoint / OneDrive / Google Drive / S3 / etc.

```bash
brew install rclone        # or your platform equivalent
rclone config              # one-time interactive setup; remember the remote name
```

Confirm the remote works:
```bash
rclone lsd <remote-name>:
```

Reference that remote in the project config under `content.remote`.

> **Caveat for Adobe-managed SharePoint:** OAuth via rclone may require Azure AD app-registration approval that not every Adobe employee can get. If `rclone config` for SharePoint can't complete the OAuth flow, fall back to the `local` source.

### `local` — point at a folder on disk

Uses `rsync` to copy from a local path. Typical use case: a SharePoint library already syncing to your Mac via the OneDrive desktop app, e.g.:

```
/Users/<you>/Library/CloudStorage/OneDrive-Adobe/HelixProjects - <Org>/<repo>
```

**Requires rsync 3.x**, not the 2.6.9 that ships with macOS — we use `--info=progress2` which is rsync-3-only. Install the modern version and make sure it's first on `PATH`:

```bash
brew install rsync
which rsync           # should print /opt/homebrew/bin/rsync, not /usr/bin/rsync
rsync --version       # should be 3.x
```

If `which rsync` still returns `/usr/bin/rsync`, prepend Homebrew to your `PATH` in `~/.zshrc`:

```bash
export PATH="/opt/homebrew/bin:$PATH"
```

> **OneDrive Files-on-Demand:** if the OneDrive folder uses placeholder files (downloaded on access), the first rsync can be very slow as each file materializes. Force a full local copy ahead of time: in Finder, select the folder → right-click → "Always keep on this device".

### `manual` and `none`

No install needed. `manual` expects you to drop files into `projects/<slug>/content/` yourself; `none` skips content sync entirely.

## Per-analyzer prerequisites

### `codeQuality`, `contentModel`, synthesis

Just the Bedrock API key (above).

### `seo`, `security`

No extra setup. They `fetch` the live site.

### `accessibility`

Puppeteer (installed by `npm install`) + Chromium (downloaded by Puppeteer's postinstall). If the analyzer fails with a launch error, run `npx puppeteer browsers install chrome` once.

### `cwv`

The vendored `ramboz/cwv-agent` uses LangChain + Google Vertex AI under the hood and needs **all** of the following in `.env`:

```bash
# CrUX field data + PSI lab data
GOOGLE_CRUX_API_KEY=...
GOOGLE_PAGESPEED_INSIGHTS_API_KEY=...

# Gemini for the agent's reasoning
GOOGLE_GEMINI_API_KEY=...

# Service account JSON for Vertex AI (used by cwv-agent's sub-agents).
# MUST be an absolute path — it is resolved from the cwv-agent vendor dir, not the repo root.
GOOGLE_APPLICATION_CREDENTIALS=/Users/<you>/.../service-account.json
```

How to get them:
1. **GCP project** with the following APIs enabled:
   - Chrome UX Report API: https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com
   - PageSpeed Insights API: https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com
   - Vertex AI API: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
2. **API key** for CrUX + PSI (one key works for both): GCP console → APIs & Services → Credentials → Create credentials → API key.
3. **Gemini API key**: https://aistudio.google.com/apikey
4. **Service account** with Vertex AI User role: GCP console → IAM & Admin → Service Accounts → Create → grant `Vertex AI User` → Keys → Add key → JSON. Save the JSON somewhere outside the repo and put the absolute path in `GOOGLE_APPLICATION_CREDENTIALS`.

> Some Adobe-managed GCP projects may not be able to issue all of these. If `cwv` is blocked, drop it from `analyzers` in your project config — the rest of the audit still runs.

## Verification

After install + `.env` is populated:

```bash
node src/cli.js list-analyzers       # should print: hello, codeQuality, contentModel, seo, security, cwv, accessibility
node src/cli.js list-projects        # (none — run `audit init <slug>`)
```

You're ready. See [README.md](README.md) for usage.
