import * as hello from './hello.js';
import * as codeQuality from './codeQuality.js';
import * as contentModel from './contentModel.js';
import * as seo from './seo.js';
import * as security from './security.js';
import * as cwv from './cwv.js';
import * as accessibility from './accessibility.js';
import * as publishStatus from './publishStatus.js';

const registry = { hello, codeQuality, contentModel, seo, security, cwv, accessibility, publishStatus };

export function getAnalyzer(name) {
  const a = registry[name];
  if (!a) throw new Error(`Unknown analyzer: ${name}. Available: ${Object.keys(registry).join(', ')}`);
  return a;
}

export function listAnalyzers() {
  return Object.keys(registry);
}
