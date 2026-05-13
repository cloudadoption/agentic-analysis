import { describe, it, expect } from 'vitest';
import { extractJson, countBy, groupBy } from './synthesize.js';

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts JSON embedded in prose', () => {
    const text = 'Sure, here is the result:\n{"summary":"ok"}\nHope that helps!';
    expect(extractJson(text)).toEqual({ summary: 'ok' });
  });

  it('handles leading/trailing whitespace', () => {
    expect(extractJson('  {"x":2}  ')).toEqual({ x: 2 });
  });

  it('uses lastIndexOf for the closing brace (nested objects)', () => {
    expect(extractJson('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow('No JSON object');
  });

  it('throws when JSON is malformed', () => {
    expect(() => extractJson('{bad json}')).toThrow();
  });
});

describe('countBy', () => {
  it('counts by key function', () => {
    const arr = [
      { severity: 'warning' },
      { severity: 'critical' },
      { severity: 'warning' },
    ];
    expect(countBy(arr, (x) => x.severity)).toEqual({ warning: 2, critical: 1 });
  });

  it('returns empty object for empty array', () => {
    expect(countBy([], (x) => x)).toEqual({});
  });
});

describe('groupBy', () => {
  it('groups items by key function', () => {
    const arr = [{ cat: 'a' }, { cat: 'b' }, { cat: 'a' }];
    const result = groupBy(arr, (x) => x.cat);
    expect(result.a).toHaveLength(2);
    expect(result.b).toHaveLength(1);
  });

  it('returns empty object for empty array', () => {
    expect(groupBy([], (x) => x)).toEqual({});
  });

  it('preserves insertion order within groups', () => {
    const arr = [{ k: 'x', v: 1 }, { k: 'x', v: 2 }];
    expect(groupBy(arr, (x) => x.k).x.map((x) => x.v)).toEqual([1, 2]);
  });
});
