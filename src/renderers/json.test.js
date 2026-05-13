import { describe, it, expect } from 'vitest';
import { countsBySeverity } from './json.js';

describe('countsBySeverity', () => {
  it('counts each severity correctly', () => {
    const findings = [
      { severity: 'critical' },
      { severity: 'warning' },
      { severity: 'warning' },
      { severity: 'info' },
      { severity: 'success' },
    ];
    expect(countsBySeverity(findings)).toEqual({ critical: 1, warning: 2, info: 1, success: 1 });
  });

  it('returns empty object for no findings', () => {
    expect(countsBySeverity([])).toEqual({});
  });

  it('handles a single severity appearing multiple times', () => {
    const findings = [{ severity: 'critical' }, { severity: 'critical' }];
    expect(countsBySeverity(findings)).toEqual({ critical: 2 });
  });
});
