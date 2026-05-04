import { converse } from './client.js';
import { getToolConfig, dispatch } from '../tools/index.js';

const MAX_TURNS = 12;
const MAX_HISTORY_CHARS = 250_000;

function historyChars(messages) {
  let n = 0;
  for (const m of messages) {
    for (const b of m.content || []) {
      if (b.text) n += b.text.length;
      if (b.toolResult) for (const c of b.toolResult.content || []) if (c.text) n += c.text.length;
      if (b.toolUse) n += JSON.stringify(b.toolUse.input || {}).length;
    }
  }
  return n;
}

function pruneToolResults(messages, keepLast = 1) {
  const toolResultIdxs = [];
  messages.forEach((m, mi) => {
    (m.content || []).forEach((b, bi) => {
      if (b.toolResult) toolResultIdxs.push([mi, bi]);
    });
  });
  const toPrune = toolResultIdxs.slice(0, Math.max(0, toolResultIdxs.length - keepLast));
  for (const [mi, bi] of toPrune) {
    const tr = messages[mi].content[bi].toolResult;
    tr.content = [{ text: '[truncated to save context]' }];
  }
}

async function finalize({ system, messages, tools, onEvent }) {
  pruneToolResults(messages, 0);
  messages.push({
    role: 'user',
    content: [{ text: 'Stop calling tools. Reply NOW with ONLY the JSON Finding[] array based on what you have seen so far. No prose, no code fences.' }],
  });
  const res = await converse({
    system, messages, tools,
    inferenceConfig: { maxTokens: 8192, temperature: 0 },
  });
  const msg = res.output?.message;
  messages.push(msg);
  onEvent({ type: 'finalize', usage: res.usage });
  const text = (msg.content || []).filter((b) => b.text).map((b) => b.text).join('\n');
  return { text, messages, usage: res.usage };
}

export async function runAgent({
  system,
  userPrompt,
  toolNames,
  projectRoot,
  onEvent = () => {},
}) {
  const tools = getToolConfig(toolNames);
  const messages = [{ role: 'user', content: [{ text: userPrompt }] }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (historyChars(messages) > MAX_HISTORY_CHARS) {
      onEvent({ type: 'budget-exhausted', turn });
      return finalize({ system, messages, tools, onEvent });
    }

    const res = await converse({
      system, messages, tools,
      inferenceConfig: { maxTokens: 8192, temperature: 0 },
    });
    const msg = res.output?.message;
    if (!msg) throw new Error(`Bedrock returned no message: ${JSON.stringify(res)}`);
    messages.push(msg);
    onEvent({ type: 'turn', turn, stopReason: res.stopReason, usage: res.usage });

    if (res.stopReason !== 'tool_use') {
      const text = (msg.content || []).filter((b) => b.text).map((b) => b.text).join('\n');
      return { text, messages, usage: res.usage };
    }

    const toolResults = [];
    for (const block of msg.content || []) {
      if (!block.toolUse) continue;
      const { toolUseId, name, input } = block.toolUse;
      onEvent({ type: 'tool', name, input });
      try {
        const out = await dispatch(name, input, { projectRoot });
        toolResults.push({
          toolResult: {
            toolUseId,
            content: [{ text: typeof out === 'string' ? out : JSON.stringify(out) }],
          },
        });
      } catch (e) {
        toolResults.push({
          toolResult: {
            toolUseId,
            content: [{ text: `Error: ${e.message}` }],
            status: 'error',
          },
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return finalize({ system, messages, onEvent });
}
