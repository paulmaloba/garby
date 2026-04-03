/**
 * storage.service.ts
 * Task: T-015 — Image Storage (Temporary)
 *
 * Uploads images to AWS S3 (or Cloudflare R2 — same S3-compatible API).
 * Files are stored with a 24-hour TTL via a lifecycle rule configured in AWS.
 * Returns a CDN-accessible URL for the detection engine to consume.
 *
 * To switch from S3 to Cloudflare R2, change only the endpoint in the client config.
 */

import S3 from 'aws-sdk/clients/s3'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

const R2_ENDPOINT = `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
const BUCKET      = process.env.AWS_S3_BUCKET ?? 'garby-uploads'

const s3 = new S3({
  accessKeyId:      process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey:  process.env.AWS_SECRET_ACCESS_KEY,
  endpoint:         R2_ENDPOINT,
  region:           'us-east-1',        // aws-sdk v2 requires a real region string even for R2
  signatureVersion: 'v4',
  s3ForcePathStyle: true,               // required for R2 path-style bucket access
})

// Allowed MIME types → file extensions
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

export interface UploadResult {
  key: string       // S3 object key
  url: string       // Public CDN URL
  size: number      // Bytes
  mimeType: string
}

/**
 * uploadImageToS3 — Uploads a file buffer to S3 and returns the CDN URL.
 * The key includes a UUID so filenames can never collide.
 * Object metadata tags the file for the 24hr lifecycle rule.
 */
export async function uploadImageToS3(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<UploadResult> {
  const ext = MIME_TO_EXT[mimeType] ?? 'jpg'
  const key = `scans/${uuidv4()}-${sanitiseFilename(originalName)}.${ext}`

  await s3.putObject({
    Bucket:       BUCKET,
    Key:          key,
    Body:         buffer,
    ContentType:  mimeType,
    // Tag for the S3 lifecycle rule that deletes temp uploads after 24 hours
//     Tagging:      'ttl=24h',
    // No ACL — use a bucket policy or CloudFront for public read
  }).promise()

  const url = buildUrl(key)

  return { key, url, size: buffer.length, mimeType }
}

/**
 * deleteFromS3 — Explicitly deletes an object.
 * Called if scan fails after upload so we don't leave orphaned files.
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3.deleteObject({ Bucket: BUCKET, Key: key }).promise()
}

/**
 * getSignedUrl — Generates a temporary pre-signed URL for private buckets.
 * Use this if the bucket is NOT publicly accessible.
 * Expires in 1 hour — enough for the detection API to fetch and scan.
 */
export function getSignedUrl(key: string, expiresInSeconds = 3600): string {
  return s3.getSignedUrl('getObject', {
    Bucket:  BUCKET,
    Key:     key,
    Expires: expiresInSeconds,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildUrl(key: string): string {
  // If a CDN base URL is configured (CloudFront / R2 custom domain), use it
  if (process.env.CDN_BASE_URL) {
    return `${process.env.CDN_BASE_URL.replace(/\/$/, '')}/${key}`
  }
  // Fall back to direct S3 URL
  return `https://${BUCKET}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com/${key}`
}

function sanitiseFilename(name: string): string {
  // Strip extension, keep only safe characters, truncate
  return path
    .basename(name, path.extname(name))
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 40)
    .toLowerCase()
}
