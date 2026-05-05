// Cloudflare Worker that serves audit reports from an R2 bucket under
// unguessable hash-prefixed paths, with automatic 90-day expiry.
// Bound to R2 bucket `AUDIT_REPORTS` via wrangler.toml.

const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8',
  pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};

const NOINDEX = {
  'x-robots-tag': 'noindex, nofollow, nosnippet, noarchive',
  'referrer-policy': 'no-referrer',
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'content-type': CONTENT_TYPES.txt, ...NOINDEX } });
}
function gone(reason) {
  return new Response(`Gone: ${reason}`, { status: 410, headers: { 'content-type': CONTENT_TYPES.txt, ...NOINDEX } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': CONTENT_TYPES.txt, ...NOINDEX } });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return notFound();
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return notFound();

    const [hash, ...rest] = parts;
    const file = rest.join('/');
    if (!/^[A-Za-z0-9_-]{16,}$/.test(hash)) return notFound();
    if (file.includes('..') || file.startsWith('/')) return notFound();

    const metaObj = await env.AUDIT_REPORTS.get(`${hash}/meta.json`);
    if (!metaObj) return notFound();
    let meta;
    try { meta = JSON.parse(await metaObj.text()); }
    catch { return notFound(); }

    if (meta.expiresAt && new Date(meta.expiresAt) <= new Date()) {
      return gone('this report expired');
    }

    if (!file) {
      return new Response(landingPage(hash, meta), {
        headers: { 'content-type': CONTENT_TYPES.html, 'cache-control': 'private, max-age=60', ...NOINDEX },
      });
    }

    const obj = await env.AUDIT_REPORTS.get(`${hash}/${file}`);
    if (!obj) return notFound();
    const ext = (file.split('.').pop() || '').toLowerCase();
    return new Response(obj.body, {
      headers: {
        'content-type': CONTENT_TYPES[ext] || obj.httpMetadata?.contentType || 'application/octet-stream',
        'cache-control': 'private, max-age=300',
        ...NOINDEX,
      },
    });
  },
};

function escape(s = '') {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const FALLBACK_DISCLAIMER = "CONFIDENTIAL — Prepared at the customer's request by the Adobe AEM Engineering team using automated audit agents. Findings reflect a snapshot of the codebase and live site at the time of generation. Intended for the customer and engagement team only; not for redistribution.";

function landingPage(hash, meta) {
  const files = (meta.files || []).filter((f) => f !== 'meta.json');
  const map = {
    'report.html': { label: 'Interactive dashboard (HTML)', emoji: '📊' },
    'report.pdf':  { label: 'Printable report (PDF)',       emoji: '📄' },
    'report.md':   { label: 'Markdown report',              emoji: '📝' },
    'findings.json': { label: 'Raw findings (JSON)',        emoji: '🔢' },
  };
  const expiry = meta.expiresAt ? new Date(meta.expiresAt).toUTCString() : '';
  const disclaimer = meta.disclaimer || FALLBACK_DISCLAIMER;
  const disclaimerBody = disclaimer.replace(/^CONFIDENTIAL\s*[—-]\s*/, '');
  const cards = files.map((f) => {
    const m = map[f] || { label: f, emoji: '📁' };
    return `<a class="card" href="./${escape(f)}"><div class="emoji">${m.emoji}</div><div class="title">${escape(m.label)}</div><div class="file">${escape(f)}</div></a>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Audit — ${escape(meta.customer || 'report')}</title>
<style>
  :root { --bg:#0b0d10; --panel:#14181d; --panel-2:#1a2027; --text:#e8eaed; --muted:#9aa3ad; --border:#262d36; --link:#6cb1ff; --warning:#ffb84d; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  .disclaimer { background: rgba(255,184,77,0.10); border-bottom: 1px solid rgba(255,184,77,0.35); color: var(--text); font-size: 13px; line-height: 1.5; padding: 14px 24px; letter-spacing: 0.01em; }
  .disclaimer strong { color: var(--warning); letter-spacing: 0.08em; font-size: 12px; display: inline-block; margin-right: 4px; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header .meta { color: var(--muted); font-size: 13px; margin-bottom: 4px; }
  header .meta a { color: var(--link); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 20px; }
  .card { display: block; padding: 18px; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; text-decoration: none; color: var(--text); transition: background 0.15s, border-color 0.15s; }
  .card:hover { background: var(--panel-2); border-color: var(--link); }
  .card .emoji { font-size: 28px; margin-bottom: 8px; }
  .card .title { font-weight: 600; margin-bottom: 2px; }
  .card .file { color: var(--muted); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; }
</style>
</head><body>
  <div class="disclaimer"><strong>CONFIDENTIAL</strong> — ${escape(disclaimerBody)}</div>
  <div class="wrap">
    <header>
      <h1>${escape(meta.customer || 'Audit report')}</h1>
      <div class="meta">${meta.site ? `<a href="${escape(meta.site)}" target="_blank" rel="noopener noreferrer">${escape(meta.site)}</a> · ` : ''}Generated ${escape(meta.publishedAt || '')}</div>
      ${expiry ? `<div class="meta">This URL expires ${escape(expiry)}.</div>` : ''}
    </header>
    <div class="grid">${cards || '<div class="card">No files</div>'}</div>
    <footer>${escape(disclaimer)}</footer>
  </div>
</body></html>`;
}
