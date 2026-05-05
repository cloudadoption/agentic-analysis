# Cloudflare delivery

This directory holds the Cloudflare Worker that serves audit reports under unguessable URLs at https://audit.bbird.live/.

## Architecture

```
audit publish (CLI)
        │ (S3-compatible PUT)
        ▼
R2 bucket: audit-reports
  └── <hash>/                ← 32-byte random base64url
        ├── meta.json
        ├── report.html
        ├── report.pdf
        ├── report.md
        └── findings.json
        ▲
        │ (R2 binding)
Worker @ audit.bbird.live ──► serves /<hash>/<file> with X-Robots-Tag: noindex
```

- URLs are unguessable (32 random bytes ≈ 2²⁵⁶ search space).
- Worker enforces a 90-day expiry from `meta.expiresAt`; expired hashes return 410 Gone.
- `robots.txt` disallows everything; every response sets `X-Robots-Tag: noindex, nofollow, nosnippet, noarchive`.
- Re-publishing a project overwrites the existing hash (stored in `projects/<slug>/.published.json`).

## One-time setup

1. **Create the R2 bucket** (Dashboard → R2 → Create bucket → name `audit-reports`).
2. **Create an R2 API token** with read+write on that bucket only:
   - Dashboard → R2 → Manage R2 API Tokens → Create token
   - Permission: Object Read & Write, scoped to `audit-reports`
   - Copy the Access Key ID and Secret Access Key
3. **Find your account ID** (Dashboard sidebar, under "Workers & Pages" or "R2").
4. **Configure DNS for `audit.bbird.live`** as a proxied (orange-cloud) `CNAME` to anything (e.g. `audit-bbird-live.workers.dev`); the route binding will overlay it.
5. **Deploy the Worker:**
   ```bash
   cd cloudflare/
   npx wrangler login                  # one-time browser flow
   npx wrangler deploy                 # uses wrangler.toml
   ```
   Wrangler creates the route automatically. Confirm in dashboard → Workers & Pages → audit-bbird-live → Triggers.
6. **Add credentials to repo `.env`** (NOT to wrangler.toml):
   ```
   CLOUDFLARE_ACCOUNT_ID=...
   CLOUDFLARE_R2_ACCESS_KEY_ID=...
   CLOUDFLARE_R2_SECRET_ACCESS_KEY=...
   CLOUDFLARE_R2_BUCKET=audit-reports
   AUDIT_REPORT_BASE_URL=https://audit.bbird.live
   ```

## Publishing

After a successful `audit run`:

```bash
node src/cli.js publish --project <slug>
```

The command uploads `report.html`, `report.pdf`, `report.md`, `findings.json`, and a `meta.json` to R2 under a per-project hash, and prints the resulting URLs. Re-running `publish` overwrites the same hash, so the URL stays stable across re-runs (until 90 days elapse, after which the worker returns 410).

To rotate the URL (force a fresh hash), delete `projects/<slug>/.published.json` before publishing.

## Updating the Worker

Edit `worker.js` and re-deploy:
```bash
cd cloudflare/ && npx wrangler deploy
```
