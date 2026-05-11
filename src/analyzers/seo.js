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

  findings.push(...await analyzeGenAiAccess({ site, robotsText: robots?.text || '', homeText: home.text, homeHeaders: home.headers }));

  return findings;
}

// GenAI bots split into two classes — see .claude/skills/genai-crawler-accessibility for the why.
const GENAI_TRAINING_BOTS = ['GPTBot', 'Google-Extended', 'anthropic-ai', 'ClaudeBot', 'CCBot', 'Applebot-Extended', 'Meta-ExternalAgent', 'Bytespider', 'cohere-ai', 'Diffbot', 'Omgilibot', 'Timpibot', 'Amazonbot'];
const GENAI_ANSWER_BOTS = ['ChatGPT-User', 'OAI-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Claude-User', 'Claude-SearchBot', 'Google-CloudVertexBot', 'YouBot', 'DuckAssistBot'];

function parseRobotsGroups(text) {
  // Returns { '<ua-lower>': ['Disallow: ...', 'Allow: ...', ...] }
  const groups = {};
  let currentUAs = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) { currentUAs = []; continue; }
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      currentUAs.push(value.toLowerCase());
      if (!groups[value.toLowerCase()]) groups[value.toLowerCase()] = [];
    } else if (currentUAs.length && (key === 'disallow' || key === 'allow')) {
      for (const ua of currentUAs) groups[ua].push(`${m[1]}: ${value}`);
    }
  }
  return groups;
}

function botStatus(groups, bot) {
  const rules = groups[bot.toLowerCase()];
  if (!rules) return 'unspecified';
  const hasFullDisallow = rules.some((r) => /^Disallow:\s*\/\s*$/.test(r));
  const hasAnyAllow = rules.some((r) => /^Allow:/.test(r));
  if (hasFullDisallow && !hasAnyAllow) return 'blocked';
  if (rules.some((r) => /^Disallow:/.test(r))) return 'partial';
  return 'allowed';
}

async function analyzeGenAiAccess({ site, robotsText, homeText, homeHeaders }) {
  const out = [];
  const findingsCategory = 'seo';

  const groups = parseRobotsGroups(robotsText);
  const statuses = {};
  for (const b of [...GENAI_TRAINING_BOTS, ...GENAI_ANSWER_BOTS]) statuses[b] = botStatus(groups, b);

  const trainingStatuses = GENAI_TRAINING_BOTS.map((b) => statuses[b]);
  const answerStatuses = GENAI_ANSWER_BOTS.map((b) => statuses[b]);
  const blockedAnswerBots = GENAI_ANSWER_BOTS.filter((b) => statuses[b] === 'blocked');
  const blockedTrainingBots = GENAI_TRAINING_BOTS.filter((b) => statuses[b] === 'blocked');
  const specifiedAny = [...trainingStatuses, ...answerStatuses].some((s) => s !== 'unspecified');

  if (!specifiedAny) {
    out.push(f({
      id: 'seo-genai-no-policy',
      category: findingsCategory,
      severity: 'info',
      title: 'No AI-crawler policy in robots.txt',
      description: 'robots.txt has no entries for any of the major generative-AI bots (GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot, etc.). Most AI crawlers honor only their own User-agent token, not `*`, and will treat absence as "allowed". Decide intentionally whether to allow or block training vs. answer-engine bots.',
      evidence: [{ url: `${site}/robots.txt` }],
    }));
  } else {
    if (blockedAnswerBots.length && !blockedTrainingBots.length) {
      out.push(f({
        id: 'seo-genai-answer-bots-blocked',
        category: findingsCategory,
        severity: 'warning',
        title: `Answer-engine AI bots blocked: ${blockedAnswerBots.join(', ')}`,
        description: 'Blocking answer-engine crawlers (ChatGPT-User, PerplexityBot, Claude-User, etc.) makes the site invisible in AI search answers while training-only crawlers remain allowed. This combination is usually unintentional. Decide whether AI-driven referral traffic matters for this brand.',
        evidence: [{ url: `${site}/robots.txt`, excerpt: blockedAnswerBots.map((b) => `${b}: ${groups[b.toLowerCase()].join(' | ')}`).join('\n') }],
      }));
    } else if (blockedTrainingBots.length && !blockedAnswerBots.length) {
      out.push(f({
        id: 'seo-genai-training-blocked',
        category: findingsCategory,
        severity: 'success',
        title: `Training bots blocked, answer-engine bots allowed (${blockedTrainingBots.length} training bots opted out)`,
        description: 'Coherent posture: keeps content out of future model-training corpora while remaining citable in live AI answers.',
        evidence: [{ url: `${site}/robots.txt`, excerpt: blockedTrainingBots.join(', ') }],
      }));
    } else if (blockedAnswerBots.length && blockedTrainingBots.length === GENAI_TRAINING_BOTS.length && blockedAnswerBots.length === GENAI_ANSWER_BOTS.length) {
      out.push(f({
        id: 'seo-genai-all-blocked',
        category: findingsCategory,
        severity: 'warning',
        title: 'All known AI crawlers blocked',
        description: 'Site is invisible to ChatGPT, Claude, Perplexity, Gemini grounding, and others. For a commercial marketing site this is almost always unintentional — confirm the policy decision was deliberate.',
        evidence: [{ url: `${site}/robots.txt` }],
      }));
    }
  }

  // ai.txt and llms.txt — fetch in parallel.
  const [aiTxt, llmsTxt] = await Promise.all([
    fetchText(`${site}/ai.txt`).catch(() => null),
    fetchText(`${site}/llms.txt`).catch(() => null),
  ]);
  if (aiTxt?.ok) {
    out.push(f({
      id: 'seo-genai-ai-txt',
      category: findingsCategory,
      severity: 'info',
      title: 'ai.txt present',
      description: 'The site publishes an /ai.txt opt-out policy. Not yet widely honored by all crawlers, but a positive signal of intent.',
      evidence: [{ url: `${site}/ai.txt` }],
    }));
  }
  if (llmsTxt?.ok) {
    out.push(f({
      id: 'seo-genai-llms-txt',
      category: findingsCategory,
      severity: 'success',
      title: 'llms.txt present',
      description: 'The site publishes an /llms.txt index — a curated markdown digest meant for LLMs to consume. Positive signal that the site is engineered for AI discoverability.',
      evidence: [{ url: `${site}/llms.txt` }],
    }));
  }

  // X-Robots-Tag header / meta robots noai / noimageai
  const xRobotsTag = homeHeaders?.get?.('x-robots-tag') || '';
  if (/\bnoai\b|\bnoimageai\b/i.test(xRobotsTag)) {
    out.push(f({
      id: 'seo-genai-x-robots-noai',
      category: findingsCategory,
      severity: 'info',
      title: 'X-Robots-Tag declares noai / noimageai',
      description: `Homepage response header: \`X-Robots-Tag: ${xRobotsTag}\`. Applies to all crawlers that honor this directive — broader than robots.txt entries.`,
      evidence: [{ url: site, excerpt: xRobotsTag }],
    }));
  }
  const robotsMetaContent = (homeText.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i) || [])[1] || '';
  if (/\bnoai\b|\bnoimageai\b/i.test(robotsMetaContent)) {
    out.push(f({
      id: 'seo-genai-meta-noai',
      category: findingsCategory,
      severity: 'info',
      title: 'Meta robots declares noai / noimageai on homepage',
      description: `\`<meta name="robots" content="${robotsMetaContent}">\` is set on the homepage. Page-level AI opt-out.`,
      evidence: [{ url: site, excerpt: robotsMetaContent }],
    }));
  }

  return out;
}
