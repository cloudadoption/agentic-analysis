---
name: Keeping It 100
description: Audit checklist for keeping an AEM Edge Delivery Services site at a Lighthouse score of 100. Codifies the rules from https://www.aem.live/developer/keeping-it-100 — load-phase model, LCP budget, image/font handling, anti-preload, third-party constraints, no-bundler/no-minifier, redirect costs, server-side rendering. Use this skill when auditing an EDS codebase or page for performance correctness, alongside bundler-detection and building-blocks.
---

# Keeping It 100

The authoritative source is **[https://www.aem.live/developer/keeping-it-100](https://www.aem.live/developer/keeping-it-100)**. The rules below are not opinions — they are the official EDS performance contract. Cite this URL in findings.

## Three-phase load model (E-L-D)

EDS sites achieve Lighthouse 100 by partitioning page load into three phases. A finding is warranted whenever any rule below is violated.

### Phase E — Eager (everything needed for LCP)

- Body starts hidden (`display:none`) to prevent premature image loading and CLS.
- DOM decoration happens first: classes for icons, buttons, blocks, sections; auto-blocks created.
- Body is shown after that decoration, before sections load.
- **First section loads completely** — its first image (LCP candidate) and all its blocks.
- Async font loading begins **after** the first section displays / LCP fires.
- **Phase E ends when LCP candidate is on screen and the first section is fully loaded.**
- **Pre-LCP payload budget: under 100 KB total.**
- **LCP timing target: ≤ 1560 ms** (the threshold for LCP scoring 100 in PSI).
- **Single-origin rule:** loading from or connecting to a second origin before LCP is strongly discouraged.

### Phase L — Lazy (everything else first-party)

- Subsequent sections, their block JS/CSS files.
- Remaining images with `loading="lazy"`.
- Non-blocking JS libraries.
- Keep the bulk of payload first-party / same origin.
- Must not regress TBT, TTI, FID/INP.

### Phase D — Delayed (third-party and non-critical)

- Marketing tooling, consent management, extended analytics, chat, tag managers.
- **Must start at least 3 seconds after the LCP event.**
- Implemented via `delayed.js` as the catch-all for blocking scripts.
- Move blocking code to web workers where possible.

### Headers / footers

- Loaded asynchronously as separate blocks. **Not on the critical path.**
- Kept in separate documents from page content for cache efficiency (different update lifecycles).

## LCP rules

- **Identify the true LCP candidate** before optimizing. Usually the hero image at the top of the page; can also be video or large text.
- Markup, CSS, and JS needed for the LCP must all be in Phase E.
- **Indirect LCP** (waiting on a fragment, JSON lookup, service call): wait for the first block's DOM changes before guessing the candidate; otherwise you pre-load the wrong asset.
- **Multiple hero images** (desktop/mobile variants): only the applicable one should be in the DOM. Redundant variants waste bandwidth and may confuse the LCP candidate selector.
- Non-image LCP requires deep understanding of the loading sequence — flag for review if seen.

## Images

- Non-critical images use `loading="lazy"` and are deferred to Phase L.
- LCP image is loaded and displayed before section visibility.
- Avoid two competing high-priority images (e.g. desktop + mobile heroes both rendered).
- Use `<picture>` / `srcset` correctly so only the applicable variant downloads.

## Fonts and CSS

- **Fonts load asynchronously, after LCP.** Use a font-fallback technique to avoid CLS while fonts arrive.
- **Do NOT preload fonts** via Early Hints, HTTP/2 Push, `<link rel="preload">`, or any markup hint. From the doc: "It would be counterproductive to preload the fonts and largely impact the performances."
- CSS is delivered with the markup (server-side rendered). CSS blocks rendering only for critical sections.
- Use CSS to decorate content; do not delay rendering for decoration.

## JavaScript and blocking time

- Avoid large JS files that block browser parsing.
- Ship individual scripts as separate small files (HTTP/2 multiplexing makes per-file requests cheap).
- Move blocking code to web workers when possible.
- Remove TBT contributors from libraries that are loaded in Phase E or L.

### No bundlers, no minifiers

- "Minification of JS and/or CSS does not add any measurable performance benefit." It adds project complexity and breaks debugging without source maps.
- Bundlers in the runtime path are forbidden (see also the **bundler-detection** skill for detailed detection and classification).

## Third-party scripts

- **Never inject before LCP.**
- **Only load in Phase D** (3+ seconds after LCP).
- Route through `delayed.js`.
- **Disable CDN-side vendor script injection** if it fires before LCP. If unavoidable, push to Phase D.

## Server-side vs. client-side rendering

- **Required:** all canonical content is rendered into markup on the server. CSS + DOM decoration handle display and semantics.
- **Limited:** client-side rendering is acceptable only when there is no canonical content (e.g. a listing block that aggregates other pages, or a true app).
- **Do NOT include semantically non-canonical content in the document markup** (headers, footers, repeated fragments). Loading them as separate documents preserves cache hit rates and avoids LCP/blocking-time penalties.

## Anti-patterns to flag

| Pattern | Why it's wrong |
|---|---|
| `<link rel="preload">` for fonts, JS, or any non-LCP asset | Consumes bandwidth that LCP needs; doc explicitly forbids it |
| `fetchpriority="high"` on non-LCP assets | Same reason as above |
| HTTP/2 Push or Early Hints for fonts / JS | Same reason as above |
| Path resolution redirects (`example.com` → `/en` → `/en/home`) | Each redirect penalizes CWV in field data even if PSI hides them |
| Bundler / minifier in runtime path | Defeats per-block lazy loading and inflates payload (see bundler-detection) |
| Polyfills or large frameworks in Phase E | Almost always blow the 100 KB pre-LCP budget |
| CDN-injected vendor script before LCP | Adds blocking JS into the critical path |
| Two hero image variants both in DOM | Wastes bandwidth, may confuse LCP candidate picker |
| Header/footer markup inlined in every page document | Bloats document, hurts cache efficiency |
| Server-side render bypassed for canonical content | Client-side rendering forces FOUC/CLS and pushes work past LCP |

## Performance budgets and metric targets

| Metric | Target |
|---|---|
| Lighthouse score (mobile) | 100 |
| Lighthouse score (desktop) | 100 |
| Pre-LCP payload | < 100 KB |
| LCP timing (lab) | ≤ 1560 ms |
| Phase D start | ≥ 3 s after LCP |
| Origins connected to before LCP | 1 (the document origin) |

## Measurement strategy

- **Lab:** PageSpeed Insights (mobile and desktop strategies). The AEM GitHub bot fails PRs whose score regresses below 100 with a small volatility buffer.
- **Field:** RUM. CrUX is the canonical aggregator. For minor changes, RUM variance is too high to draw conclusions — rely on lab tests.
- **Comparison:** PSI against `.aem.live` origin vs. the CDN-fronted production URL surfaces CDN-introduced regressions (script injection, redirects, TTFB).

## Findings to emit

When this skill applies, prefer concrete, evidence-backed findings. Examples:

- `100-pre-lcp-payload-budget` — quote the actual byte count if known; cite the file(s).
- `100-fonts-preloaded` — `severity: warning`. Cite the offending `<link rel="preload">` markup.
- `100-third-party-in-eager` — `severity: warning` or `critical` if an analytics/SDK script is in `head.html` or `scripts.js` eager phase.
- `100-redirect-chain` — `severity: warning` for any 30x chain on the canonical URLs.
- `100-cdn-injection-before-lcp` — when a CDN edge worker injects a `<script>` upstream.
- `100-canonical-content-not-server-rendered` — when canonical body content is hydrated client-side.
- `100-no-build-step` — `severity: success` when the project ships source files directly.

Always reference the specific rule from this skill or the source URL.
