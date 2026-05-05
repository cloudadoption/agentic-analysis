import { runAgent } from '../bedrock/agentLoop.js';
import { loadSkills } from '../skills.js';
import { FindingsArraySchema } from '../schema/finding.js';
import { extractJsonArray } from '../utils/extract-json.js';

export const meta = {
  name: 'contentModel',
  skills: ['content-modeling'],
  tools: ['glob', 'readFile', 'grep'],
};

const SYSTEM_BASE = `You are a content-model auditor for AEM Edge Delivery Services projects.

Your scope:
- Read content under content/ — markdown files (.md) generated from the authored docx via helix-docx2md (or synced from DA).
- Use glob with pattern "content/**/*.md" to map the layout, then readFile to inspect representative pages.
- Sample broadly but pragmatically: do not try to read every file. Pick representative pages from different top-level sections.
- Compare what you find against the canonical content models from the loaded skill.

Before flagging anything as exposed/published/indexed, read the project's path-exclusion configs in this order:
- code/paths.json (or code/helix-config.yaml) for path mappings.
- code/helix-query.yaml for sitemap/index inclusion rules.
- code/robots.txt or code/.helix/robots.txt for crawler directives.
- code/sidekick/ or code/tools/sidekick/library.json for authoring scopes.
- Top-level metadata sheets like content/metadata.xlsx (read .md siblings if present) for noindex/private flags.

If a candidate folder (e.g. content/drafts/, content/private/, content/internal/) is already excluded by any of these, do NOT flag it as a publishing risk. Either omit the finding, or downgrade it to severity "info" with a note that the exclusion was verified, citing the specific config file and rule.

Identify findings about:
- Block usage patterns and which canonical model type each block follows (Standalone, Collection, Configuration, Auto-Blocked).
- Anti-patterns: too many columns, configuration cells where not needed, non-semantic structure.
- Metadata coverage and consistency.
- Inconsistent block authoring across pages.
- Positive patterns worth recognizing.

Reply with ONLY a JSON array of Finding objects. No prose, no code fences. Each Finding:
{
  "id": "kebab-case-stable-id",
  "analyzer": "contentModel",
  "severity": "warning" | "info" | "success",
  "category": "best-practice" | "configuration" | "documentation" | "architecture" | "other",
  "title": "short headline",
  "description": "what you found and why it matters, citing the skill",
  "recommendation": "optional fix",
  "evidence": [{ "file": "content/...", "excerpt": "short snippet" }]
}

If content/ is empty or absent, return a single info finding noting that.`;

const USER = `Audit the content under content/. Be selective: read at most ~12 files total.

1. First, check exclusion configs: read code/paths.json (if present), code/helix-query.yaml (if present), and code/robots.txt (if present). Note which folders/paths are excluded from publishing or indexing.
2. Then glob "content/**/*.md" to map the content layout, and sample 5–8 representative pages from different top-level sections.
3. Emit the JSON findings, applying the exclusion rules from step 1 before flagging any folder as a publishing risk.

For each block usage you sample, also flag content-model complexity smells:
- tables with more than 4 columns (too many cells per row)
- tables with configuration cells when content cells would suffice
- inconsistent block authoring (same block used with different shapes across pages)
- semantic formatting overloaded with meaning beyond what the canonical model defines
- excessive nested fragments or auto-blocks that authors cannot reason about
- tables that should be default content (paragraphs/lists) but are forced into a block`;

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
  return FindingsArraySchema.parse(extractJsonArray(text));
}
