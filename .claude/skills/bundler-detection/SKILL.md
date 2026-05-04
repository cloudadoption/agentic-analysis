---
name: Bundler Detection
description: Detect JavaScript bundlers (webpack, Vite, Rollup, esbuild, Parcel, etc.) in an AEM Edge Delivery Services project and assess whether they break the boilerplate's three-phase loading sequence (eager / lazy / delayed) or interfere with RUM (sampleRUM) tracking. Use this skill when auditing an EDS codebase for performance and observability correctness.
---

# Bundler Detection

AEM Edge Delivery Services (EDS) is **designed to ship source files directly** to the browser over HTTP/2 — no bundling required. The boilerplate's `aem.js`, `scripts.js`, and `delayed.js` implement a carefully sequenced load (`loadEager` → `loadLazy` → `loadDelayed`) and a built-in RUM telemetry pipeline (`sampleRUM`). A misconfigured bundler can silently break both.

This skill helps you (1) detect bundler usage and (2) classify whether it is harmless, risky, or actively breaking the EDS contract.

## Canonical reference

The authoritative EDS boilerplate is **[adobe/aem-boilerplate](https://github.com/adobe/aem-boilerplate)**. Use it as the source of truth when judging drift. Key invariants from the boilerplate:

- Files under `scripts/` are served as-is — no bundler in the runtime path.
- The expected load order, driven from `head.html`, is **`aem.js` first, then `scripts.js`** (which dynamically imports `delayed.js` after a delay). There is **no `entrypoint.js`, no `index.js`, no bundled wrapper.**
- The inline `<script>` block in `head.html` boots `window.hlx` and the initial `sampleRUM('top')` call. This must remain inline, not bundled.
- Block JS lives at `blocks/<name>/<name>.js` and is loaded dynamically by `scripts.js` via `await import()` based on what's actually on the page.

Any deviation from this shape — an extra entry file, a `dist/` referenced from `head.html`, `aem.js` and `scripts.js` co-bundled, hashed filenames — is a finding.

## When to Use

- Auditing an EDS code repository for performance posture or RUM data integrity.
- Investigating CWV regressions (LCP/INP) on EDS sites that have unusual build artifacts.
- Reviewing pull requests that introduce a `dist/` or `build/` directory.

## Detection: signals to look for

Cast a wide net — bundlers can be added subtly. Look at all of these:

### 1. Config files at the repo root

| File pattern | Bundler |
|---|---|
| `webpack.config.{js,cjs,mjs,ts}`, `webpack.*.config.*` | webpack |
| `vite.config.{js,ts,mjs}` | Vite |
| `rollup.config.{js,mjs,ts}` | Rollup |
| `esbuild.config.{js,mjs}`, `build.{js,mjs}` (with esbuild import) | esbuild |
| `rspack.config.*` | Rspack |
| `parcel.config.*`, `.parcelrc` | Parcel |
| `tsup.config.*` | tsup |
| `snowpack.config.*` | Snowpack |
| `bunfig.toml`, `bun.lockb` (with bundle scripts) | Bun bundler |
| `gulpfile.{js,ts}`, `Gruntfile.js` | Gulp/Grunt (often wrapping a bundler) |

### 2. `package.json` evidence

Read `code/package.json` and check:
- **Scripts** — keys named `build`, `bundle`, `dist`, `compile`, especially when invoking `webpack`, `vite build`, `rollup -c`, `esbuild`, `parcel build`.
- **Dependencies / devDependencies** — packages: `webpack`, `webpack-cli`, `vite`, `rollup`, `esbuild`, `parcel`, `rspack`, `@rspack/*`, `tsup`, `snowpack`, `terser`, `swc`, `@babel/core`, `gulp-*`, `grunt-*`.
- **`type` field** — explicit `"commonjs"` is a smell in EDS (boilerplate is ESM-first); a bundler may have been added to transpile.

### 3. Output directories committed to the repo

Browse the tree for:
- `dist/`, `build/`, `out/`, `.output/`, `lib/`, `public/dist/`, `static/dist/` — especially when they contain JS that resembles the source under `blocks/` or `scripts/`.
- A pattern where `head.html` or other entry points reference `/dist/...` instead of `/scripts/scripts.js`.

### 4. Bundled-code fingerprints

Read a sample of JS files and look for telltale runtime markers:

| Marker | Bundler |
|---|---|
| `__webpack_require__`, `webpackJsonp`, `webpack_module_cache`, `(self["webpackChunk` | webpack |
| `__vite__createHotContext`, `__vitePreload`, `import.meta.glob` | Vite |
| `import_*` aliasing chains, `__commonJS`, `__toCommonJS` (esbuild output) | esbuild |
| `parcelRequire` | Parcel |
| `r$1`, `t$1` minified single-letter exports + `//# sourceMappingURL=` at end | any minifier (terser/swc) |
| Inline base64 modules like `data:application/javascript;base64,` | aggressive bundler |

### 5. Boilerplate alterations

Open `code/scripts/aem.js` and `code/scripts/scripts.js` if present, and check whether they have been:
- **Inlined into a bundle** — if `aem.js` source is now several thousand lines that look like compiled output.
- **Renamed** — a `aem.js` that is now `aem.bundle.js`, `vendor.js`, etc., and the `head.html` was updated to load it.
- **Wrapped** — wrapped in IIFEs or webpack chunk loaders.

## Classification: harmless vs. risky vs. breaking

Once a bundler is detected, classify the impact. The boilerplate's contract is what matters; not all bundling is bad.

### Harmless (info-level finding, optional)

- A bundler exists in `package.json` **but only for tooling** (e.g. building a sidekick plugin, generating icons, processing `.scss` to vanilla `.css` outside the runtime path).
- The runtime code under `code/blocks/`, `code/scripts/`, `code/styles/` is still the unbundled source, served as-is.
- Build outputs go to a path that is not in the served tree (`tools/dist/`, `node_modules/.cache`).

### Risky (warning-level finding)

- A `dist/` or `build/` directory is committed and **referenced from `head.html`** or `paths.json`, but the boilerplate three-phase functions (`loadEager`, `loadLazy`, `loadDelayed`) still appear to be invoked.
- The bundler concatenates per-block JS into one file, defeating lazy block loading. CWV may suffer but RUM still works.
- Dynamic `import()` of blocks has been replaced by static imports — blocks load eagerly even when not on the page.
- Tree-shaking is enabled aggressively; some `sampleRUM(...)` call sites may be DCE'd if the bundler can't prove the global side effects.

### Breaking (warning- or critical-level finding)

These actively defeat EDS's design and should be fixed:

- **`aem.js` is bundled into `scripts.js`** (or vice versa). The three phases collapse into one — eager and delayed both fire at parse time. **LCP / INP / CLS will degrade**.
- **The inline RUM bootstrap snippet** that lives at the top of `head.html` (or `scripts.js`) has been removed, mangled, or replaced by a bundled `import('./rum.js')`. **RUM data is partially or wholly lost.**
- **`window.hlx` or the `sampleRUM` global** is renamed/mangled by a minifier. Boilerplate features and downstream tooling that read those globals stop working.
- **Hashed filenames** (`scripts.abc123.js`) without matching loader rewrites — broken page loads.
- **CSS bundled into JS** via webpack `style-loader` or similar — the eager critical-CSS strategy is lost; FOUC + CLS.
- **A service worker added by the bundler** intercepting `/scripts/*` requests and serving stale bundles.

## Required cross-checks before flagging

Bundlers are sometimes added for legitimate reasons. Before flagging anything as a problem, verify:

1. **Is the bundled output actually served?** Read `code/head.html` and any `paths.json` mapping. If `/dist/` files are not in the served path, the bundler is build-tooling only.
2. **Do the three load phases still exist at runtime?** Confirm `loadEager`, `loadLazy`, `loadDelayed` are still called with reasonable spacing (e.g. `loadDelayed` behind a 3-second `setTimeout` or interaction event).
3. **Is RUM still firing?** Look for the inline bootstrap in `head.html` or the top of `scripts.js`. The expected shape:
   ```js
   window.hlx = window.hlx || {};
   window.hlx.RUM_MASK_URL = 'full';
   // ...
   sampleRUM('top');
   ```
   If this is missing or has been replaced by `import('./rum.js')`, RUM data is at risk.
4. **What does CrUX / RUM Explorer say?** If the audit has access to CrUX or RUM data and the site is reporting normal CWV + event volume, the bundler is at worst a code-smell, not a regression.

## Findings to emit

When this skill applies, structure your findings around concrete evidence. Examples:

- `bundler-detected-webpack` — `severity: info` if harmless, `warning` if risky.
- `bundler-bundles-aem-js` — `severity: warning` (or `critical` if RUM is also affected).
- `bundler-breaks-rum-bootstrap` — `severity: warning` if the inline `sampleRUM('top')` call is missing.
- `bundler-defeats-lazy-load-phase` — `severity: warning` when blocks are statically imported into the eager bundle.
- `bundler-build-tooling-only` — `severity: info` (positive note: bundler exists but doesn't touch served code).

Cite the specific config file and line numbers, and quote the offending build script.

## Recommendations

- **Default position: remove the bundler from the runtime path.** EDS is designed to serve source. HTTP/2 multiplexing makes per-file requests cheap.
- If the bundler is genuinely needed (legacy SaaS migration, large vendor SDKs), keep it scoped to a single non-critical entry — never bundle `aem.js`, `scripts.js`, `delayed.js`, or anything in `head.html`.
- Preserve the inline RUM bootstrap verbatim. If bundling is unavoidable, add `sampleRUM` and `window.hlx` to a "no-mangle" / "external globals" allowlist.
- Keep dynamic block imports dynamic (`await import(\`/blocks/\${name}/\${name}.js\`)`). Bundlers that resolve these at build time eliminate lazy loading.
- Add a CI check that diffs the served `aem.js` against the upstream EDS boilerplate; alert on drift.
