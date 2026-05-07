import { z } from 'zod';

export const Severity = z.enum(['critical', 'warning', 'info', 'success']);
export const Category = z.enum([
  'security', 'performance', 'accessibility', 'seo',
  'best-practice', 'configuration', 'compatibility',
  'architecture', 'documentation', 'testing', 'other',
]);

export const Evidence = z.object({
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  excerpt: z.string().optional(),
  url: z.string().url().optional(),
});

export const Metric = z.object({
  key: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.enum(['ms', 's', 'score', 'count']).default('ms'),
  thresholds: z.object({ good: z.number(), poor: z.number() }),
});

export const FindingSchema = z.object({
  id: z.string(),
  analyzer: z.string(),
  severity: Severity,
  category: Category,
  title: z.string(),
  description: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(Evidence).default([]),
  metrics: z.array(Metric).optional(),
});

export const FindingsArraySchema = z.array(FindingSchema);
