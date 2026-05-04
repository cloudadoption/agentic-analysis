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

export const FindingSchema = z.object({
  id: z.string(),
  analyzer: z.string(),
  severity: Severity,
  category: Category,
  title: z.string(),
  description: z.string(),
  recommendation: z.string().optional(),
  evidence: z.array(Evidence).default([]),
});

export const FindingsArraySchema = z.array(FindingSchema);
