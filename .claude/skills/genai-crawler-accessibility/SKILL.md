---
name: GenAI Crawler Accessibility
description: Determine whether a site is reachable by generative-AI crawlers (ChatGPT, Claude, Perplexity, Gemini, Common Crawl, etc.) and whether the site's stated policy matches the operator's intent. Distinguishes training crawlers from answer-engine / retrieval-augmented crawlers, and inspects robots.txt, ai.txt, llms.txt, meta tags, and HTTP headers. Use this skill when auditing an AEM Edge Delivery Services site's discoverability in AI-driven surfaces.
---

# GenAI Crawler Accessibility

Two distinct populations of bots matter, and conflating them produces wrong findings:

| Class | Examples | What blocking does |
|---|---|---|
| **Training crawlers** | `GPTBot`, `Google-Extended`, `anthropic-ai`, `ClaudeBot`, `CCBot` (Common Crawl), `Applebot-Extended`, `Meta-ExternalAgent`, `cohere-ai`, `Diffbot`, `Bytespider`, `Omgilibot`, `Timpibot` | Excludes your content from future model training corpora. Has **no effect** on whether your site appears in AI answers today. |
| **Answer-engine / RAG crawlers** | `ChatGPT-User`, `OAI-SearchBot`, `PerplexityBot`, `Perplexity-User`, `Claude-User`, `Claude-SearchBot`, `Google-CloudVertexBot`, `YouBot`, `DuckAssistBot` | Fetches your content **at query time** to cite in an AI answer. Blocking = your brand is invisible in AI search results. |

Most AEM Edge Delivery customers want answer-engine bots **allowed** (drives referral traffic, brand presence) and may have an opinion either way on training bots. A blanket `Disallow: /` for `*` against AI user-agents is almost always wrong for a commercial site.

## Where the policy lives

Check these in order. Findings should cite the specific file and line.

1. **`/robots.txt`** — the authoritative source. Look for explicit `User-agent:` entries matching the bots above. Remember:
   - `User-agent: *` does **not** target AI bots specifically — many AI crawlers respect their own UA token but ignore the `*` directive.
   - The most-specific matching `User-agent` group wins; `Allow:` lines can re-open paths.
   - Order matters in some implementations but not in the RFC — flag ambiguous setups.

2. **`/ai.txt`** — a proposed standard from Spawning.ai for opting out of generative training. If present, parse `Disallow:` / `Allow:` per media type. Not yet widely honored, but a positive signal of intent.

3. **`/llms.txt`** — a different proposal entirely. This is a *curated* markdown index meant **for LLMs to consume**, not a policy file. Presence indicates the site wants to be AI-discoverable. Do not conflate with ai.txt.

4. **HTTP response headers** on the homepage and a sample of pages:
   - `X-Robots-Tag: noai`, `noimageai`, `noindex` — applies to all UAs that honor it.
   - Same tag with a UA prefix (e.g. `X-Robots-Tag: GPTBot: noai`) — applies per-bot.

5. **HTML `<meta>` tags** in `<head>`:
   - `<meta name="robots" content="noai, noimageai">` — page-level opt-out.
   - `<meta name="GPTBot" content="noindex">` — bot-specific.

6. **Edge / WAF blocking** (Cloudflare Bot Fight Mode, Akamai Bot Manager, AWS WAF rules). You cannot detect this from robots.txt alone. Symptoms:
   - 403 / 401 / 429 responses to requests with the bot's UA but 200 to a normal browser UA.
   - Cloudflare-specific: a `Server: cloudflare` header plus a challenge page or `cf-mitigated: challenge`.
   - This silently overrides everything in robots.txt. Flag as a separate finding when detected; recommend coordinating with the security team.

## How to verify reachability

Don't trust robots.txt alone — test live fetches.

For each bot under audit, issue `GET /` (and 2-3 representative deep paths) with:
- `User-Agent: <bot UA string>` (full string from the bot's documentation page)
- `Accept: text/html`
- A clean IP (no prior session)

Classify the response:
- **200 + HTML body** → reachable.
- **200 + challenge page** (Cloudflare interstitial, hCaptcha, JS challenge) → blocked at the edge.
- **403 / 401 / 429 / 503** → blocked.
- **301 / 302 to a login or block page** → effectively blocked.

A bot is **accessible** only when robots.txt allows it AND the edge does not block it AND no `noai` / `noindex` header or meta tag applies.

## Canonical bot UA strings (use exactly when testing)

| Operator | Bot name | UA token |
|---|---|---|
| OpenAI | training | `GPTBot` |
| OpenAI | live citations / ChatGPT browse | `ChatGPT-User` |
| OpenAI | SearchGPT index | `OAI-SearchBot` |
| Google | Bard/Gemini training | `Google-Extended` (governance token, not a separate crawler — controls Googlebot's training use) |
| Google | Vertex grounding | `Google-CloudVertexBot` |
| Anthropic | training | `anthropic-ai`, `ClaudeBot` |
| Anthropic | live citations | `Claude-User`, `Claude-SearchBot` |
| Perplexity | indexing | `PerplexityBot` |
| Perplexity | live answer fetch | `Perplexity-User` |
| Apple | Apple Intelligence training | `Applebot-Extended` (governance token over `Applebot`) |
| Meta | training | `Meta-ExternalAgent` |
| ByteDance | training | `Bytespider` |
| Common Crawl | broad scrape (used by many models) | `CCBot` |
| Amazon | Alexa / Q | `Amazonbot` |
| Cohere | training | `cohere-ai` |
| You.com | answer engine | `YouBot` |
| DuckDuckGo | DuckAssist | `DuckAssistBot` |

Use the official UA strings from each operator's docs when fetching — partial matches in robots.txt are case-insensitive but UA matching at the edge is often strict.

## AEM Edge Delivery specifics

- The robots.txt for an EDS site is served from `/robots.txt` on the production hostname, which usually maps via Helix paths to `code/robots.txt` or `code/.helix/robots.txt`. Read both.
- The aem.live preview and live hostnames (`*.aem.page`, `*.aem.live`) have their own robots.txt — typically `Disallow: /` for everything. Findings about *production* policy should be sourced from the production hostname, not the EDS subdomains.
- `query-index.json` is a content discovery surface frequently scraped by AI crawlers. If sensitive paths are excluded from `query-index.json` via `code/helix-query.yaml` but accessible via direct URL, note that AI crawlers fetching the homepage will still find them through internal links.

## What to surface as findings

Use these as the shape for findings — they're the patterns worth flagging.

- **No AI-specific policy stated** (only `User-agent: *` rules) — info severity. The site implicitly allows everything that respects `*`, but several AI bots only honor their own UA and will treat absence of their entry as "allowed".
- **All AI training bots blocked, answer bots allowed** — success. This is a coherent, defensible posture.
- **Answer bots blocked, training bots allowed** — warning. Almost always unintentional (someone copy-pasted a generic block list); makes the brand invisible in AI answers while still feeding training corpora.
- **Everything blocked via `Disallow: /` for AI UAs on a commercial marketing site** — warning, with a question for the customer about intent. Often a security team decision the marketing team is unaware of.
- **Edge / WAF blocks an AI bot that robots.txt allows** — critical configuration drift. Flag the response code and the discrepancy.
- **`noai` / `noimageai` header or meta tag present** — info; note which scope (site-wide vs per-page).
- **Conflicting signals** (e.g. robots.txt allows GPTBot but `X-Robots-Tag: noai` is set) — warning. Pick the stricter one; AI bots may interpret differently.
- **No `Sitemap:` reference in robots.txt** — info for AI discoverability. Answer-engine bots use sitemaps to find content beyond the homepage.
- **Presence of `/llms.txt`** — success / info. Positive signal that the site is curated for AI consumption.

## Reporting style

When emitting findings via this skill, refer to the site, the homepage, or specific paths — never the local `.md` representation. Cite `robots.txt`, `ai.txt`, or the response header verbatim in evidence so the reviewer can audit the decision.
