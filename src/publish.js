import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const FILES = [
  { name: 'report.html', type: 'text/html; charset=utf-8' },
  { name: 'report.pdf', type: 'application/pdf' },
  { name: 'report.md', type: 'text/markdown; charset=utf-8' },
  { name: 'findings.json', type: 'application/json; charset=utf-8' },
];

const TTL_DAYS = 90;

export async function publish({ projectDir, slug, config }) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'audit-reports';
  const baseUrl = (process.env.AUDIT_REPORT_BASE_URL || 'https://audit.bbird.live').replace(/\/$/, '');

  const missing = [];
  if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const publishedPath = path.join(projectDir, '.published.json');
  let hash;
  try {
    const existing = JSON.parse(await readFile(publishedPath, 'utf8'));
    if (existing.hash && /^[A-Za-z0-9_-]+$/.test(existing.hash)) hash = existing.hash;
  } catch {}
  if (!hash) hash = crypto.randomBytes(24).toString('base64url');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const uploaded = [];
  for (const f of FILES) {
    const local = path.join(projectDir, f.name);
    try { await stat(local); }
    catch { continue; }
    const body = await readFile(local);
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${hash}/${f.name}`,
      Body: body,
      ContentType: f.type,
    }));
    uploaded.push(f.name);
  }
  if (!uploaded.length) {
    throw new Error(`No report files found in ${projectDir}. Run \`audit run\` first.`);
  }

  const meta = {
    customer: config.customer,
    project: slug,
    site: config.site,
    publishedAt: now.toISOString(),
    expiresAt,
    files: uploaded,
  };
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `${hash}/meta.json`,
    Body: JSON.stringify(meta, null, 2),
    ContentType: 'application/json; charset=utf-8',
  }));

  await writeFile(publishedPath, JSON.stringify({
    hash,
    lastPublishedAt: meta.publishedAt,
    expiresAt,
    baseUrl,
  }, null, 2));

  return {
    hash,
    expiresAt,
    uploaded,
    urls: {
      landing: `${baseUrl}/${hash}/`,
      ...Object.fromEntries(uploaded.map((f) => [f.replace(/\W/g, '_'), `${baseUrl}/${hash}/${f}`])),
    },
  };
}
