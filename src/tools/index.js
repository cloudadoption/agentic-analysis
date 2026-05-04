import * as readFile from './readFile.js';
import * as glob from './glob.js';
import * as grep from './grep.js';
import * as readDocx from './readDocx.js';

const all = { readFile, glob, grep, readDocx };

export function getToolConfig(names = Object.keys(all)) {
  return names.map((n) => ({ toolSpec: all[n].spec }));
}

export async function dispatch(name, input, ctx) {
  const tool = all[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.run(input, ctx);
}
