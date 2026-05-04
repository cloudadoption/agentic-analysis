const DEFAULT_REGION = 'us-west-2';
const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-6';

export function endpoint({ region = DEFAULT_REGION, modelId = DEFAULT_MODEL } = {}) {
  return `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
}

export async function converse({
  messages,
  system,
  tools,
  inferenceConfig = { maxTokens: 4096, temperature: 0 },
  apiKey = process.env.BEDROCK_API_KEY,
  region = process.env.BEDROCK_REGION || DEFAULT_REGION,
  modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL,
}) {
  if (!apiKey) throw new Error('BEDROCK_API_KEY is not set');

  const body = { messages, inferenceConfig };
  if (system) body.system = Array.isArray(system) ? system : [{ text: system }];
  if (tools && tools.length) body.toolConfig = { tools };

  const bodyJson = JSON.stringify(body);
  if (process.env.DEBUG_BEDROCK) {
    const sysChars = (body.system || []).reduce((n, b) => n + (b.text?.length || 0), 0);
    const msgChars = (body.messages || []).reduce((n, m) => n + (m.content || []).reduce((nn, b) => nn + (b.text?.length || 0) + (b.toolResult?.content || []).reduce((x, c) => x + (c.text?.length || 0), 0), 0), 0);
    console.error(`[bedrock] body=${bodyJson.length} sys=${sysChars} msgs=${msgChars} tools=${(body.toolConfig?.tools || []).length}`);
  }
  const res = await fetch(endpoint({ region, modelId }), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: bodyJson,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bedrock ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}
