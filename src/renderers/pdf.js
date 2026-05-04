import { writeFile, readFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import * as html from './html.js';

export async function render(ctx) {
  const { projectDir, slug } = ctx;
  await mkdir(projectDir, { recursive: true });
  const htmlPath = path.join(projectDir, 'report.html');
  try { await stat(htmlPath); }
  catch { await html.render(ctx); }

  const pdfPath = path.join(projectDir, 'report.pdf');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    });
    await writeFile(pdfPath, pdf);
  } finally {
    await browser.close();
  }
  return pdfPath;
}
