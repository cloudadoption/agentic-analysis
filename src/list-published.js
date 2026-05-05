import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

function s3Client() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const missing = [];
  if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function listHashes(s3, bucket) {
  const hashes = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Delimiter: '/',
      ContinuationToken: token,
    }));
    for (const p of r.CommonPrefixes || []) {
      const h = (p.Prefix || '').replace(/\/$/, '');
      if (h) hashes.push(h);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return hashes;
}

async function fetchMeta(s3, bucket, hash) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: `${hash}/meta.json` }));
    const text = await r.Body.transformToString();
    return JSON.parse(text);
  } catch { return null; }
}

export async function listPublished({ activeOnly = false } = {}) {
  const s3 = s3Client();
  const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'audit-reports';
  const baseUrl = (process.env.AUDIT_REPORT_BASE_URL || 'https://audit.bbird.live').replace(/\/$/, '');
  const hashes = await listHashes(s3, bucket);
  const metas = await Promise.all(hashes.map(async (h) => ({ hash: h, meta: await fetchMeta(s3, bucket, h) })));
  const now = Date.now();
  const records = metas
    .filter((r) => r.meta)
    .map(({ hash, meta }) => {
      const expiresMs = meta.expiresAt ? new Date(meta.expiresAt).getTime() : null;
      const expired = expiresMs != null && expiresMs <= now;
      const daysRemaining = expiresMs != null ? Math.max(0, Math.ceil((expiresMs - now) / 86400_000)) : null;
      return {
        hash,
        project: meta.project || '(unknown)',
        customer: meta.customer || '',
        site: meta.site || '',
        publishedAt: meta.publishedAt,
        expiresAt: meta.expiresAt,
        expired,
        daysRemaining,
        url: `${baseUrl}/${hash}/`,
      };
    })
    .sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || '')).reverse();
  return activeOnly ? records.filter((r) => !r.expired) : records;
}
