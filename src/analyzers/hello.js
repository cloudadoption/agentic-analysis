import { runAgent } from '../bedrock/agentLoop.js';
import { FindingsArraySchema } from '../schema/finding.js';

export const meta = {
  name: 'hello',
  skills: [],
  tools: ['glob', 'readFile'],
};

const SYSTEM = `You are an end-to-end smoke test for the agentic-analysis tool.
Your job: use the glob tool to count files under code/, then return ONE finding summarizing what you found.

You MUST reply with ONLY a JSON array (no prose, no code fences) matching this shape:
[{
  "id": "string",
  "analyzer": "hello",
  "severity": "info",
  "category": "other",
  "title": "string",
  "description": "string",
  "evidence": [{"file": "string"}]
}]`;

const USER = `Count the files under code/ using the glob tool with pattern "code/**/*". Then return one info-level finding describing the size of the codebase.`;

export async function run({ projectDir, config }) {
  const { text } = await runAgent({
    system: SYSTEM,
    userPrompt: USER,
    toolNames: meta.tools,
    projectRoot: projectDir,
  });
  const json = extractJson(text);
  return FindingsArraySchema.parse(json);
}

function extractJson(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error(`No JSON array in model output: ${trimmed.slice(0, 200)}`);
  return JSON.parse(trimmed.slice(start, end + 1));
}
