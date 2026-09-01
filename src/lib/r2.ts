import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import fs from 'fs'
import path from 'path'

export interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicUrl: string
}

/** Check if R2 environment variables are configured. */
export function isR2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME)
}

/** Get R2 configuration from environment variables. */
export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucketName = process.env.R2_BUCKET_NAME?.trim()
  const publicUrl = process.env.R2_PUBLIC_URL?.trim() || ''

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/+$/, ''),
  }
}

/** Cache S3Client instance. */
let cachedClient: S3Client | null = null

export function getR2Client(): S3Client | null {
  const config = getR2Config()
  if (!config) return null

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }
  return cachedClient
}

/** Resolve MIME content type by file extension. */
export function getMimeType(filePathOrName: string): string {
  const ext = path.extname(filePathOrName).toLowerCase().replace(/^\./, '')
  switch (ext) {
    // Videos
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mkv':
      return 'video/x-matroska'
    case 'mov':
      return 'video/quicktime'
    case 'avi':
      return 'video/x-msvideo'
    case '3gp':
      return 'video/3gpp'
    case 'ts':
      return 'video/mp2t'
    // Images
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Upload a local file directly to Cloudflare R2 bucket.
 * Returns the public URL and key.
 */
export async function uploadFileToR2(
  localFilePath: string,
  key: string,
  contentType?: string
): Promise<{ url: string; key: string }> {
  const client = getR2Client()
  const config = getR2Config()
  if (!client || !config) {
    throw new Error('Cloudflare R2 is not configured. Missing environment variables.')
  }

  const fileStream = fs.createReadStream(localFilePath)
  const fileStat = await fs.promises.stat(localFilePath)
  const resolvedContentType = contentType || getMimeType(localFilePath)

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: key,
    Body: fileStream,
    ContentLength: fileStat.size,
    ContentType: resolvedContentType,
    CacheControl: 'public, max-age=31536000, immutable',
  })

  await client.send(command)

  // Construct public URL
  let publicUrl: string
  if (config.publicUrl) {
    publicUrl = `${config.publicUrl}/${key}`
  } else {
    // Fallback standard R2 endpoint (if public bucket access is enabled)
    publicUrl = `https://${config.bucketName}.${config.accountId}.r2.cloudflarestorage.com/${key}`
  }

  return {
    url: publicUrl,
    key,
  }
}

/**
 * Delete a file from Cloudflare R2.
 */
export async function deleteFileFromR2(key: string): Promise<boolean> {
  const client = getR2Client()
  const config = getR2Config()
  if (!client || !config) return false

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    })
    await client.send(command)
    return true
  } catch (err) {
    console.error('Failed to delete from R2:', err)
    return false
  }
}

/**
 * Test the Cloudflare R2 connection and bucket accessibility.
 */
export async function testR2Connection(): Promise<{
  ok: boolean
  message: string
  bucket?: string
  publicUrl?: string
}> {
  const config = getR2Config()
  if (!config) {
    return {
      ok: false,
      message: 'R2 environment variables are missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).',
    }
  }

  try {
    const client = getR2Client()
    if (!client) throw new Error('Could not create S3 client')

    // Test bucket existence/access
    await client.send(new HeadBucketCommand({ Bucket: config.bucketName }))

    return {
      ok: true,
      message: `Successfully connected to Cloudflare R2 bucket "${config.bucketName}".`,
      bucket: config.bucketName,
      publicUrl: config.publicUrl || 'Direct R2 Storage Endpoint',
    }
  } catch (err) {
    return {
      ok: false,
      message: `R2 connection failed: ${err instanceof Error ? err.message : String(err)}`,
      bucket: config.bucketName,
    }
  }
}
