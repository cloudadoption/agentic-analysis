// Extract a JSON array from a model response. Tolerant of truncated output
// (e.g. when a tool-use loop hits maxTokens mid-array): walks the buffer
// tracking brace depth + string state and truncates to the last complete
// top-level object before re-closing the array.

export function extractJsonArray(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf('[');
  if (start === -1) throw new Error(`No JSON array in model output: ${trimmed.slice(0, 300)}`);

  const tail = trimmed.slice(start);
  const lastClose = tail.lastIndexOf(']');
  if (lastClose !== -1) {
    try { return JSON.parse(tail.slice(0, lastClose + 1)); } catch {}
  }
  return salvageArray(tail);
}

function salvageArray(text) {
  let depth = 0;
  let inStr = false;
  let escape = false;
  let lastCompleteEnd = -1;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) lastCompleteEnd = i + 1;
    }
  }
  if (lastCompleteEnd === -1) return [];
  const repaired = `${text.slice(0, lastCompleteEnd)}]`;
  return JSON.parse(repaired);
}
