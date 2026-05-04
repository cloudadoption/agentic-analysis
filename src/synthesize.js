import { converse } from './bedrock/client.js';
import { z } from 'zod';

const SynthesisSchema = z.object({
  summary: z.string(),
  topPriorities: z.array(z.string()).default([]),
  categories: z.record(z.string(), z.object({
    insight: z.string(),
    recommendation: z.string().optional().default(''),
  })),
});

const SYSTEM = `You are a principal engineer writing an executive summary for an automated audit of an AEM Edge Delivery Services site.

Inputs: a JSON array of findings. Each finding has { analyzer, severity, category, title }.

Produce a brief, actionable summary aimed at the engineering lead and product owner. Be specific and concrete — never generic. Cite counts and concrete pattern names where possible.

Reply with ONLY this JSON shape (no prose, no code fences):
{
  "summary": "2–4 sentences. State the overall posture (e.g. healthy / needs attention / critical), the most important theme, and the single highest-leverage action.",
  "topPriorities": ["3–5 short, imperative sentences. Each is a concrete next step in priority order."],
  "categories": {
    "<categoryName>": {
      "insight": "One paragraph (2–4 sentences) describing what the audit revealed in this category, citing the most representative findings.",
      "recommendation": "One paragraph (1–3 sentences) of concrete next steps for this category."
    }
  }
}

Only include categories that have at least one finding. Use the exact category strings from the input.`;

export async function synthesize({ findings }) {
  if (!findings.length) {
    return { summary: 'No findings produced. Check analyzer logs for errors.', topPriorities: [], categories: {} };
  }

  const compact = findings.map((f) => ({
    analyzer: f.analyzer, severity: f.severity, category: f.category, title: f.title,
  }));
  const counts = countBy(findings, (f) => f.severity);
  const byCat = groupBy(findings, (f) => f.category);
  const userPrompt = `Findings (${findings.length} total — ${JSON.stringify(counts)}):\n\n${JSON.stringify(compact)}\n\nCategories present: ${Object.keys(byCat).join(', ')}.`;

  const res = await converse({
    system: SYSTEM,
    messages: [{ role: 'user', content: [{ text: userPrompt }] }],
    inferenceConfig: { maxTokens: 4096, temperature: 0 },
  });
  const text = (res.output?.message?.content || []).filter((b) => b.text).map((b) => b.text).join('\n');
  const json = extractJson(text);
  return SynthesisSchema.parse(json);
}

function extractJson(text) {
  const t = text.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object in synthesis output: ${t.slice(0, 300)}`);
  return JSON.parse(t.slice(start, end + 1));
}

function countBy(arr, fn) {
  return arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
}
function groupBy(arr, fn) {
  return arr.reduce((acc, x) => { const k = fn(x); (acc[k] ||= []).push(x); return acc; }, {});
}
