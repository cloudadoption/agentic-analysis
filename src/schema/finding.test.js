import { describe, it, expect } from 'vitest';
import { FindingSchema, FindingsArraySchema } from './finding.js';

const base = {
  id: 'f1',
  analyzer: 'seo',
  severity: 'warning',
  category: 'seo',
  title: 'Missing meta description',
  description: 'No meta description found.',
};

describe('FindingSchema', () => {
  it('accepts a minimal valid finding', () => {
    const result = FindingSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const result = FindingSchema.safeParse({
      ...base,
      recommendation: 'Add a meta description.',
      evidence: [{ file: 'src/index.js', line: 10, excerpt: 'no meta' }],
      metrics: [{
        key: 'lcp', label: 'LCP', value: 2500, unit: 'ms',
        thresholds: { good: 2500, poor: 4000 },
        direction: 'lower-is-better',
      }],
    });
    expect(result.success).toBe(true);
  });

  it('defaults evidence to empty array', () => {
    const result = FindingSchema.parse(base);
    expect(result.evidence).toEqual([]);
  });

  it('rejects an unknown severity', () => {
    const result = FindingSchema.safeParse({ ...base, severity: 'blocker' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown category', () => {
    const result = FindingSchema.safeParse({ ...base, category: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { title, ...noTitle } = base;
    const result = FindingSchema.safeParse(noTitle);
    expect(result.success).toBe(false);
  });

  it('rejects a negative evidence line number', () => {
    const result = FindingSchema.safeParse({
      ...base,
      evidence: [{ line: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid evidence URL', () => {
    const result = FindingSchema.safeParse({
      ...base,
      evidence: [{ url: 'not-a-url' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('FindingsArraySchema', () => {
  it('parses an empty array', () => {
    expect(FindingsArraySchema.parse([])).toEqual([]);
  });

  it('parses multiple valid findings', () => {
    const result = FindingsArraySchema.safeParse([base, { ...base, id: 'f2', severity: 'critical' }]);
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });

  it('rejects if any finding is invalid', () => {
    const result = FindingsArraySchema.safeParse([base, { ...base, severity: 'bad' }]);
    expect(result.success).toBe(false);
  });
});
