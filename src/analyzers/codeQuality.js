import { runAgent } from '../bedrock/agentLoop.js';
import { loadSkills } from '../skills.js';
import { FindingsArraySchema } from '../schema/finding.js';

export const meta = {
  name: 'codeQuality',
  skills: ['building-blocks', 'testing-blocks', 'bundler-detection', 'keeping-it-100'],
  tools: ['glob', 'readFile', 'grep'],
};

const SYSTEM_BASE = `You are a senior reviewer auditing an AEM Edge Delivery Services codebase under code/.

Use the loaded skills as the authoritative source for what is good or bad. Be specific: cite file paths, and line numbers when relevant. Sample broadly but pragmatically — do not try to read every file. Start with glob to map the codebase, then deep-dive into representative blocks (e.g. one or two from each top-level area), plus the core scripts.js / aem.js, and any linting / testing config.

Look for:
- WARNING-level issues: innerHTML without sanitization, unscoped CSS selectors, !important usage, deprecated hlx.page/hlx.live domains, malformed configs, missing linting/tests for logic-heavy utilities, mutating elements outside block scope, leaving temp DOM elements behind.
- INFO-level observations: architecture choices, complexity, documentation gaps, refactoring opportunities, interesting patterns.
- SUCCESS-level findings: alignment with best practices — proper scoping, CSS custom properties, lazy loading, async/await, semantic HTML, async loading patterns, good test coverage.
- Bundler interference (per the bundler-detection skill): detect webpack/Vite/Rollup/esbuild/Parcel/etc.; classify as harmless tooling, risky, or breaking. Specifically check whether the boilerplate three-phase load (loadEager/loadLazy/loadDelayed) and the inline sampleRUM bootstrap are intact. Cite the specific config file or built artifact as evidence.
- Lighthouse-100 contract (per the keeping-it-100 skill): pre-LCP payload <100KB, no <link rel="preload">/fetchpriority/Early Hints, fonts loaded async after LCP, third-party scripts only in Phase D (3s+ after LCP), no bundlers/minifiers in runtime path, no redirect chains, server-side rendering for canonical content, single-origin pre-LCP. Cite the specific rule and source markup.

Reply with ONLY a JSON array of Finding objects. No prose, no code fences. Each Finding:
{
  "id": "kebab-case-stable-id",
  "analyzer": "codeQuality",
  "severity": "critical" | "warning" | "info" | "success",
  "category": "security" | "performance" | "best-practice" | "configuration" | "compatibility" | "architecture" | "documentation" | "testing" | "other",
  "title": "short headline",
  "description": "what the issue is and why it matters, citing the skill guideline violated or upheld",
  "recommendation": "how to fix (omit for info/success unless useful)",
  "evidence": [{ "file": "code/...", "line": 42, "excerpt": "short snippet" }]
}

Aim for 10–25 findings total across severities. Quality over quantity.`;

const USER = `Audit the codebase under code/. Be selective: read at most ~15 files total. Start with one glob to map the project, then sample 4–6 representative blocks (don't read every block), the core scripts (scripts.js, aem.js, delayed.js if present), one or two CSS files, and any test/lint configs.

For each block you sample, also flag complexity smells:
- decorate() function exceeds ~150 lines of code
- deeply nested DOM construction (>4 levels)
- more than 3 visual variants handled in one block
- mixed concerns (data fetching + rendering + state management in one file)
- block JS file >300 lines without clear separation
- duplicated logic that should be hoisted to a shared utility

Then emit the JSON findings.`;

export async function run({ projectDir, onEvent = () => {} }) {
  const skillsText = await loadSkills(meta.skills, { projectRoot: projectDir });
  const system = `${SYSTEM_BASE}\n\n# Loaded skills\n\n${skillsText}`;
  const { text } = await runAgent({
    system,
    userPrompt: USER,
    toolNames: meta.tools,
    projectRoot: projectDir,
    onEvent,
  });
  return FindingsArraySchema.parse(extractJson(text));
}

function extractJson(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error(`No JSON array in model output: ${trimmed.slice(0, 300)}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}
