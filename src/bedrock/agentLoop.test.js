import { describe, it, expect } from 'vitest';
import { historyChars, pruneToolResults } from './agentLoop.js';

describe('historyChars', () => {
  it('counts text blocks', () => {
    const messages = [{ content: [{ text: 'hello' }] }];
    expect(historyChars(messages)).toBe(5);
  });

  it('counts toolUse input JSON', () => {
    const messages = [{ content: [{ toolUse: { input: { path: 'a' } } }] }];
    expect(historyChars(messages)).toBe(JSON.stringify({ path: 'a' }).length);
  });

  it('counts nested toolResult content', () => {
    const messages = [{
      content: [{
        toolResult: { content: [{ text: 'result' }] },
      }],
    }];
    expect(historyChars(messages)).toBe(6);
  });

  it('sums across multiple messages and block types', () => {
    const messages = [
      { content: [{ text: 'ab' }] },
      { content: [{ toolResult: { content: [{ text: 'cde' }] } }] },
    ];
    expect(historyChars(messages)).toBe(5);
  });

  it('returns 0 for empty message list', () => {
    expect(historyChars([])).toBe(0);
  });

  it('handles messages with no content array', () => {
    expect(historyChars([{}])).toBe(0);
  });
});

describe('pruneToolResults', () => {
  function makeMessages(count) {
    return Array.from({ length: count }, (_, i) => ({
      role: 'user',
      content: [{
        toolResult: {
          toolUseId: `id-${i}`,
          content: [{ text: `result ${i}` }],
        },
      }],
    }));
  }

  it('replaces all but the last keepLast tool results with placeholder', () => {
    const messages = makeMessages(3);
    pruneToolResults(messages, 1);
    expect(messages[0].content[0].toolResult.content).toEqual([{ text: '[truncated to save context]' }]);
    expect(messages[1].content[0].toolResult.content).toEqual([{ text: '[truncated to save context]' }]);
    expect(messages[2].content[0].toolResult.content).toEqual([{ text: 'result 2' }]);
  });

  it('prunes all when keepLast is 0', () => {
    const messages = makeMessages(2);
    pruneToolResults(messages, 0);
    for (const m of messages) {
      expect(m.content[0].toolResult.content).toEqual([{ text: '[truncated to save context]' }]);
    }
  });

  it('leaves everything intact when keepLast >= total tool results', () => {
    const messages = makeMessages(2);
    pruneToolResults(messages, 5);
    expect(messages[0].content[0].toolResult.content).toEqual([{ text: 'result 0' }]);
    expect(messages[1].content[0].toolResult.content).toEqual([{ text: 'result 1' }]);
  });

  it('is a no-op on messages with no tool results', () => {
    const messages = [{ role: 'user', content: [{ text: 'hi' }] }];
    pruneToolResults(messages, 1);
    expect(messages[0].content[0].text).toBe('hi');
  });

  it('mutates in place and returns undefined', () => {
    const messages = makeMessages(1);
    const result = pruneToolResults(messages, 0);
    expect(result).toBeUndefined();
    expect(messages[0].content[0].toolResult.content[0].text).toBe('[truncated to save context]');
  });
});
