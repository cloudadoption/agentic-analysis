import * as json from './json.js';
import * as html from './html.js';
import * as md from './md.js';
import * as pdf from './pdf.js';

const registry = { json, html, md, pdf };

export async function render(formats, ctx) {
  const written = [];
  for (const fmt of formats) {
    const r = registry[fmt];
    if (!r) {
      console.warn(`[renderer] skipping unknown format: ${fmt}`);
      continue;
    }
    written.push(await r.render(ctx));
  }
  return written;
}
