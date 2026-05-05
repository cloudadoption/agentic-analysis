import * as cheerio from 'cheerio';

export const meta = { name: 'publishStatus', skills: [], tools: [] };

const UA = 'agentic-analysis/2.0 (+https://github.com/cloudadoption/agentic-analysis)';

function f(partial) {
  return { analyzer: 'publishStatus', severity: 'info', category: 'configuration', evidence: [], ...partial };
}

function deriveEdsUrls(repoUrl, ref = 'main') {
  // Accept https://github.com/<owner>/<repo>(.git)? and ssh forms
  const m = repoUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!m) return {};
  const [, owner, repo] = m;
  const slug = `${ref}--${repo}--${owner}`;
  return {
    liveUrl: `https://${slug}.aem.live`,
    previewUrl: `https://${slug}.aem.page`,
  };
}

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    return { ok: res.ok, status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
  } catch (e) {
    return { ok: false, status: 0, url, text: '', err: e.message };
  }
}

async function fetchJson(url) {
  const r = await fetchText(url);
  if (!r.ok) return { ok: false, status: r.status };
  try { return { ok: true, status: r.status, json: JSON.parse(r.text) }; }
  catch { return { ok: false, status: r.status }; }
}

function mainHash(html) {
  if (!html) return '';
  const $ = cheerio.load(html);
  const main = $('main').html() || $('body').html() || html;
  // Light normalization: collapse whitespace, strip scripts.
  return main.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').trim().slice(0, 100_000);
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

function pickSample(paths, n) {
  const unique = [...new Set(paths)].filter((p) => typeof p === 'string' && p.startsWith('/'));
  if (unique.length <= n) return unique;
  // Always include `/`, then evenly stride the rest
  const sample = unique.includes('/') ? ['/'] : [];
  const rest = unique.filter((p) => p !== '/');
  const stride = Math.max(1, Math.floor(rest.length / (n - sample.length)));
  for (let i = 0; i < rest.length && sample.length < n; i += stride) sample.push(rest[i]);
  return sample;
}

function pathsFromSitemap(xml) {
  const out = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    try { out.push(new URL(m[1]).pathname); } catch {}
  }
  return out;
}

export async function run({ config }) {
  const findings = [];
  const site = config.site.replace(/\/$/, '');
  const cfg = config.eds || {};
  const derived = deriveEdsUrls(config.source?.code?.repo, config.source?.code?.ref || 'main');
  const liveUrl = (cfg.liveUrl || derived.liveUrl || '').replace(/\/$/, '');
  const previewUrl = (cfg.previewUrl || derived.previewUrl || '').replace(/\/$/, '');
  const queryIndexPath = cfg.queryIndexPath || '/query-index.json';
  const sampleSize = config.publishStatus?.sampleSize || 10;

  if (!liveUrl) {
    return [f({
      id: 'pub-no-live-url',
      severity: 'info',
      title: 'EDS live URL not configured and could not be derived',
      description: 'Set config.eds.liveUrl (e.g. https://main--<repo>--<owner>.aem.live) or ensure source.code.repo is a github URL so it can be auto-derived.',
    })];
  }

  // 1. Fetch query-index.json from EDS live
  const qiUrl = `${liveUrl}${queryIndexPath}`;
  const qi = await fetchJson(qiUrl);
  let qiPaths = [];
  if (!qi.ok) {
    findings.push(f({
      id: 'pub-query-index-missing',
      severity: 'warning',
      title: `EDS query-index missing or unreachable (${qi.status || 'no response'})`,
      description: `GET ${qiUrl} did not return a JSON document. Without query-index, publish-status checks fall back to sitemap.xml only.`,
      evidence: [{ url: qiUrl }],
    }));
  } else {
    const data = Array.isArray(qi.json) ? qi.json : (qi.json.data || []);
    qiPaths = data.map((row) => row.path).filter(Boolean);
    findings.push(f({
      id: 'pub-query-index-ok',
      severity: 'success',
      title: `EDS query-index lists ${qiPaths.length} published path(s)`,
      description: '',
      evidence: [{ url: qiUrl }],
    }));
  }

  // 2. Fetch sitemap.xml from prod
  const smUrl = `${site}/sitemap.xml`;
  const sm = await fetchText(smUrl);
  let smPaths = [];
  if (sm.ok) {
    smPaths = pathsFromSitemap(sm.text);
  }

  // 3. Cross-reference query-index vs sitemap
  if (qiPaths.length && smPaths.length) {
    const qiSet = new Set(qiPaths);
    const smSet = new Set(smPaths);
    const inQiNotSm = qiPaths.filter((p) => !smSet.has(p));
    const inSmNotQi = smPaths.filter((p) => !qiSet.has(p));
    if (inQiNotSm.length > 5) {
      findings.push(f({
        id: 'pub-published-but-not-in-sitemap',
        severity: 'warning',
        title: `${inQiNotSm.length} published path(s) missing from sitemap.xml`,
        description: 'Pages exist in EDS query-index but are not advertised to crawlers via sitemap.xml. They may be intentionally hidden, or the sitemap is stale.',
        evidence: inQiNotSm.slice(0, 5).map((p) => ({ url: `${liveUrl}${p}` })),
      }));
    }
    if (inSmNotQi.length > 5) {
      findings.push(f({
        id: 'pub-in-sitemap-but-not-published',
        severity: 'warning',
        title: `${inSmNotQi.length} sitemap path(s) not in EDS query-index`,
        description: 'sitemap.xml advertises pages that EDS does not list as published. They may be drafts, orphans, or served by a non-EDS layer.',
        evidence: inSmNotQi.slice(0, 5).map((p) => ({ url: `${site}${p}` })),
      }));
    }
  }

  // 4. Sample paths and verify on both prod + live
  const candidatePaths = qiPaths.length ? qiPaths : smPaths;
  if (!candidatePaths.length) {
    findings.push(f({
      id: 'pub-no-paths-to-sample',
      severity: 'info',
      title: 'No paths to sample (no query-index, no sitemap)',
      description: 'Cannot verify publish status without either a query-index.json on EDS live or a sitemap.xml on prod.',
    }));
    return findings;
  }
  const sample = pickSample(candidatePaths, sampleSize);

  let mismatches = 0;
  let cdnDrift = 0;
  let prodOnly = 0;
  let liveOnly = 0;
  for (const p of sample) {
    const [prod, live] = await Promise.all([fetchText(`${site}${p}`), fetchText(`${liveUrl}${p}`)]);
    if (prod.ok && !live.ok) {
      mismatches++; prodOnly++;
      findings.push(f({
        id: `pub-prod-only-${djb2(p)}`,
        severity: 'warning',
        title: `Path served by prod but missing on EDS live: ${p}`,
        description: `${site}${p} returned ${prod.status} but ${liveUrl}${p} returned ${live.status}. Either prod is serving cached/non-EDS content, or routing is broken.`,
        evidence: [{ url: `${site}${p}` }, { url: `${liveUrl}${p}` }],
      }));
    } else if (!prod.ok && live.ok) {
      mismatches++; liveOnly++;
      findings.push(f({
        id: `pub-live-only-${djb2(p)}`,
        severity: 'critical',
        title: `Path published on EDS but 404 on prod: ${p}`,
        description: `EDS live serves ${liveUrl}${p} (${live.status}) but the customer's CDN returns ${prod.status} for ${site}${p}. Publish chain or routing is broken.`,
        evidence: [{ url: `${site}${p}` }, { url: `${liveUrl}${p}` }],
      }));
    } else if (prod.ok && live.ok) {
      const ph = djb2(mainHash(prod.text));
      const lh = djb2(mainHash(live.text));
      if (ph !== lh) {
        cdnDrift++;
        findings.push(f({
          id: `pub-drift-${djb2(p)}`,
          severity: 'info',
          title: `Markup differs between prod and EDS live: ${p}`,
          description: `Both URLs return 200 but the rendered <main> content differs. Likely a CDN injection (analytics/personalization), edge transform, or stale cache. Diff hashes: prod=${ph}, live=${lh}.`,
          evidence: [{ url: `${site}${p}` }, { url: `${liveUrl}${p}` }],
        }));
      }
    }
  }

  if (mismatches === 0 && cdnDrift === 0) {
    findings.push(f({
      id: 'pub-sample-clean',
      severity: 'success',
      title: `All ${sample.length} sampled paths match on prod and EDS live`,
      description: 'Status codes match and rendered <main> markup is identical (or close enough after script-stripping + whitespace normalization).',
    }));
  }

  findings.push(f({
    id: 'pub-summary',
    severity: 'info',
    title: `Publish status: ${sample.length} paths sampled — ${mismatches} mismatches, ${cdnDrift} markup drifts`,
    description: `query-index pages: ${qiPaths.length}. sitemap pages: ${smPaths.length}. EDS live: ${liveUrl}. Preview: ${previewUrl || '(none)'}.`,
  }));

  return findings;
}
