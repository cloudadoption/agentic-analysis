import * as cheerio from 'cheerio';

export const meta = { name: 'seo', skills: [], tools: [] };

const UA = 'agentic-analysis/2.0 (+https://github.com/adobe)';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '', headers: res.headers };
}

function f(partial) {
  return {
    analyzer: 'seo',
    severity: 'info',
    category: 'seo',
    evidence: [],
    ...partial,
  };
}

export async function run({ config }) {
  const findings = [];
  const site = config.site.replace(/\/$/, '');

  const home = await fetchText(site).catch((e) => ({ ok: false, status: 0, text: '', err: e.message }));
  if (!home.ok) {
    return [f({
      id: 'seo-home-unreachable',
      severity: 'critical',
      title: `Homepage unreachable (${home.status || home.err})`,
      description: `GET ${site} returned ${home.status || 'no response'}. SEO analysis aborted.`,
      evidence: [{ url: site }],
    })];
  }

  const $ = cheerio.load(home.text);
  const title = $('head > title').first().text().trim();
  const desc = $('meta[name="description"]').attr('content')?.trim() || '';
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || '';
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || '';
  const ogDesc = $('meta[property="og:description"]').attr('content')?.trim() || '';
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || '';
  const twitterCard = $('meta[name="twitter:card"]').attr('content')?.trim() || '';
  const robotsMeta = $('meta[name="robots"]').attr('content')?.trim() || '';
  const lang = $('html').attr('lang')?.trim() || '';
  const h1Count = $('h1').length;
  const images = $('img').toArray();
  const imgsMissingAlt = images.filter((el) => !$(el).attr('alt')).length;
  const ldJson = $('script[type="application/ld+json"]').length;

  if (!title) {
    findings.push(f({ id: 'seo-no-title', severity: 'warning', title: 'Homepage missing <title>', description: 'No <title> element found in <head>.', evidence: [{ url: site }] }));
  } else if (title.length < 10 || title.length > 70) {
    findings.push(f({ id: 'seo-title-length', severity: 'info', title: `Homepage title length ${title.length} chars`, description: `Recommended 10–70 chars. Current: "${title}".`, evidence: [{ url: site, excerpt: title }] }));
  } else {
    findings.push(f({ id: 'seo-title-ok', severity: 'success', title: 'Homepage <title> present and reasonable length', description: `Title: "${title}".`, evidence: [{ url: site, excerpt: title }] }));
  }

  if (!desc) {
    findings.push(f({ id: 'seo-no-description', severity: 'warning', title: 'Homepage missing meta description', description: 'No <meta name="description"> on the homepage.', evidence: [{ url: site }] }));
  } else if (desc.length < 50 || desc.length > 200) {
    findings.push(f({ id: 'seo-description-length', severity: 'info', title: `Meta description length ${desc.length} chars`, description: 'Recommended 50–160 chars for full display in SERPs.', evidence: [{ url: site, excerpt: desc }] }));
  }

  if (!canonical) {
    findings.push(f({ id: 'seo-no-canonical', severity: 'warning', title: 'Homepage missing canonical link', description: 'No <link rel="canonical"> set.', evidence: [{ url: site }] }));
  }

  const ogMissing = [['og:title', ogTitle], ['og:description', ogDesc], ['og:image', ogImage]].filter(([, v]) => !v).map(([k]) => k);
  if (ogMissing.length) {
    findings.push(f({ id: 'seo-og-missing', severity: 'warning', category: 'seo', title: `Missing Open Graph tags: ${ogMissing.join(', ')}`, description: 'OG tags drive link previews on Facebook, LinkedIn, Slack, etc.', evidence: [{ url: site }] }));
  } else {
    findings.push(f({ id: 'seo-og-complete', severity: 'success', title: 'Open Graph tags complete', description: 'og:title, og:description, og:image all present.', evidence: [{ url: site }] }));
  }

  if (!twitterCard) {
    findings.push(f({ id: 'seo-twitter-missing', severity: 'info', title: 'Missing twitter:card meta', description: 'Add <meta name="twitter:card"> for rich Twitter/X previews.', evidence: [{ url: site }] }));
  }

  if (!lang) {
    findings.push(f({ id: 'seo-no-lang', severity: 'warning', category: 'accessibility', title: '<html> missing lang attribute', description: 'lang aids screen readers and SEO.', evidence: [{ url: site }] }));
  }

  if (h1Count === 0) {
    findings.push(f({ id: 'seo-no-h1', severity: 'warning', title: 'No <h1> on homepage', description: 'Each page should have exactly one <h1>.', evidence: [{ url: site }] }));
  } else if (h1Count > 1) {
    findings.push(f({ id: 'seo-multiple-h1', severity: 'info', title: `${h1Count} <h1> elements on homepage`, description: 'Multiple <h1>s can dilute heading hierarchy.', evidence: [{ url: site }] }));
  }

  if (images.length > 0) {
    const pct = Math.round(((images.length - imgsMissingAlt) / images.length) * 100);
    if (imgsMissingAlt > 0) {
      findings.push(f({
        id: 'seo-alt-coverage',
        severity: imgsMissingAlt > images.length / 2 ? 'warning' : 'info',
        category: 'accessibility',
        title: `Image alt coverage on homepage: ${pct}% (${imgsMissingAlt}/${images.length} missing)`,
        description: 'Images without alt text are inaccessible to screen readers and miss SEO opportunity.',
        evidence: [{ url: site }],
      }));
    } else {
      findings.push(f({ id: 'seo-alt-complete', severity: 'success', category: 'accessibility', title: 'All homepage images have alt text', description: `${images.length} images checked.`, evidence: [{ url: site }] }));
    }
  }

  if (ldJson > 0) {
    findings.push(f({ id: 'seo-structured-data', severity: 'success', title: `${ldJson} JSON-LD structured data block(s) on homepage`, description: 'Structured data improves rich search result eligibility.', evidence: [{ url: site }] }));
  } else {
    findings.push(f({ id: 'seo-no-structured-data', severity: 'info', title: 'No JSON-LD structured data on homepage', description: 'Consider Organization, WebSite, or BreadcrumbList markup.', evidence: [{ url: site }] }));
  }

  const robots = await fetchText(`${site}/robots.txt`).catch(() => null);
  if (!robots || !robots.ok) {
    findings.push(f({ id: 'seo-no-robots', severity: 'warning', title: 'No robots.txt', description: '/robots.txt is missing or unreachable.', evidence: [{ url: `${site}/robots.txt` }] }));
  } else {
    const hasSitemapRef = /sitemap:/i.test(robots.text);
    if (!hasSitemapRef) {
      findings.push(f({ id: 'seo-robots-no-sitemap', severity: 'info', title: 'robots.txt has no Sitemap reference', description: 'Add a `Sitemap:` line so crawlers find it.', evidence: [{ url: `${site}/robots.txt` }] }));
    } else {
      findings.push(f({ id: 'seo-robots-ok', severity: 'success', title: 'robots.txt references sitemap', description: 'Crawlers can discover the sitemap.', evidence: [{ url: `${site}/robots.txt` }] }));
    }
  }

  const sitemap = await fetchText(`${site}/sitemap.xml`).catch(() => null);
  if (!sitemap || !sitemap.ok) {
    findings.push(f({ id: 'seo-no-sitemap', severity: 'warning', title: 'No sitemap.xml at /sitemap.xml', description: 'Default sitemap location returned no result.', evidence: [{ url: `${site}/sitemap.xml` }] }));
  } else {
    const urlCount = (sitemap.text.match(/<url>/g) || []).length;
    findings.push(f({ id: 'seo-sitemap-ok', severity: 'success', title: `sitemap.xml present (${urlCount} URLs)`, description: '', evidence: [{ url: `${site}/sitemap.xml` }] }));
  }

  if (robotsMeta && /noindex/i.test(robotsMeta)) {
    findings.push(f({ id: 'seo-noindex', severity: 'critical', title: 'Homepage marked noindex', description: `<meta name="robots" content="${robotsMeta}"> excludes the homepage from search.`, evidence: [{ url: site }] }));
  }

  return findings;
}
