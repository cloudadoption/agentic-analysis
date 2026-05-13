import { describe, it, expect } from 'vitest';
import { escape, zoneColor, formatMetric, buildHtml } from './html.js';

describe('escape', () => {
  it('escapes all four HTML special characters', () => {
    expect(escape('<script>"hello" & \'world\'</script>'))
      .toBe('&lt;script&gt;&quot;hello&quot; &amp; \'world\'&lt;/script&gt;');
  });

  it('returns empty string for empty input', () => {
    expect(escape('')).toBe('');
  });

  it('handles undefined gracefully', () => {
    expect(escape(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(escape(42)).toBe('42');
  });

  it('does not double-escape already-escaped entities', () => {
    expect(escape('&amp;')).toBe('&amp;amp;');
  });
});

describe('zoneColor', () => {
  const thresholds = { good: 2500, poor: 4000 };

  describe('lower-is-better (default)', () => {
    it('returns success at or below good threshold', () => {
      expect(zoneColor(2500, thresholds)).toBe('var(--success)');
      expect(zoneColor(1000, thresholds)).toBe('var(--success)');
    });

    it('returns warning between good and poor', () => {
      expect(zoneColor(2501, thresholds)).toBe('var(--warning)');
      expect(zoneColor(3999, thresholds)).toBe('var(--warning)');
    });

    it('returns critical at or above poor threshold', () => {
      expect(zoneColor(4000, thresholds)).toBe('var(--critical)');
      expect(zoneColor(9000, thresholds)).toBe('var(--critical)');
    });
  });

  describe('higher-is-better', () => {
    const hib = { good: 90, poor: 50 };

    it('returns success at or above good threshold', () => {
      expect(zoneColor(90, hib, 'higher-is-better')).toBe('var(--success)');
      expect(zoneColor(100, hib, 'higher-is-better')).toBe('var(--success)');
    });

    it('returns warning between poor and good', () => {
      expect(zoneColor(51, hib, 'higher-is-better')).toBe('var(--warning)');
      expect(zoneColor(89, hib, 'higher-is-better')).toBe('var(--warning)');
    });

    it('returns critical at or below poor threshold', () => {
      expect(zoneColor(50, hib, 'higher-is-better')).toBe('var(--critical)');
      expect(zoneColor(10, hib, 'higher-is-better')).toBe('var(--critical)');
    });
  });
});

describe('formatMetric', () => {
  it('formats ms values below 1000 as integer ms', () => {
    expect(formatMetric(250, 'ms')).toBe('250ms');
  });

  it('formats ms values at 1000+ as seconds with two decimals', () => {
    expect(formatMetric(1000, 'ms')).toBe('1.00s');
    expect(formatMetric(2540, 'ms')).toBe('2.54s');
  });

  it('formats score >= 1 as rounded integer', () => {
    expect(formatMetric(95.6, 'score')).toBe('96');
  });

  it('formats score < 1 as trimmed decimal', () => {
    expect(formatMetric(0.1, 'score')).toBe('0.1');
    expect(formatMetric(0.100, 'score')).toBe('0.1');
  });

  it('formats percent as rounded integer with % suffix', () => {
    expect(formatMetric(72.8, 'percent')).toBe('73%');
  });

  it('falls back to string for unknown units', () => {
    expect(formatMetric(42, 'count')).toBe('42');
  });
});

const minConfig = {
  customer: 'Acme Corp',
  site: 'https://acme.com',
  analyzers: ['seo', 'security'],
};

const minFinding = {
  id: 'f1',
  analyzer: 'seo',
  severity: 'warning',
  category: 'seo',
  title: 'Missing meta description',
  description: 'No meta description found.',
  evidence: [],
};

describe('buildHtml', () => {
  it('returns a string starting with <!doctype html>', () => {
    const html = buildHtml({ findings: [], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html.trimStart()).toMatch(/^<!doctype html>/i);
  });

  it('includes the customer name in the title', () => {
    const html = buildHtml({ findings: [], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).toContain('Acme Corp');
  });

  it('escapes customer name to prevent XSS', () => {
    const xssConfig = { ...minConfig, customer: '<Evil>' };
    const html = buildHtml({ findings: [], synthesis: null, config: xssConfig, slug: 'test' });
    expect(html).toContain('&lt;Evil&gt;');
    expect(html).not.toContain('<Evil>');
  });

  it('renders severity counts in the stats bar', () => {
    const html = buildHtml({ findings: [minFinding], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).toContain('<div class="n">1</div>');
  });

  it('inlines findings as JSON in DATA', () => {
    const html = buildHtml({ findings: [minFinding], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).toContain('"Missing meta description"');
  });

  it('escapes </ in inlined JSON to prevent script injection', () => {
    const xssFinding = { ...minFinding, title: 'test</script>attack' };
    const html = buildHtml({ findings: [xssFinding], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).not.toContain('</script>attack');
    expect(html).toContain('<\\/script>attack');
  });

  it('renders executive summary when synthesis is provided', () => {
    const synthesis = {
      summary: 'Site is healthy.',
      topPriorities: ['Fix missing meta descriptions'],
      categories: {},
    };
    const html = buildHtml({ findings: [], synthesis, config: minConfig, slug: 'acme' });
    expect(html).toContain('Site is healthy.');
    expect(html).toContain('Fix missing meta descriptions');
  });

  it('omits exec section when synthesis is null', () => {
    const html = buildHtml({ findings: [], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).not.toContain('Executive Summary');
  });

  it('renders the heatmap when findings exist', () => {
    const html = buildHtml({ findings: [minFinding], synthesis: null, config: minConfig, slug: 'acme' });
    expect(html).toContain('Analyzer × Severity');
  });
});
