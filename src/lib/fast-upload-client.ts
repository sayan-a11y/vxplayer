'use client'

/**
 * VX Player — fast upload engine.
 *
 * Small files take the single-shot streaming route (one round trip,
 * still streamed server-side, no buffering). Bigger files are split into
 * ~5 MB chunks uploaded 3-at-a-time with per-chunk retry — this saturates
 * the connection through proxies/mobile networks, survives individual
 * chunk failures without restarting the whole file, and gives smooth
 * progress. The server assembles + ffprobe-validates on complete.
 */
import { toast } from 'sonner'

const SMALL_FILE_BYTES = 3 * 1024 * 1024 // 3 MB (safe under Vercel 4.5 MB limit)
const PARALLEL_CHUNKS = 3
const CHUNK_RETRIES = 3
const XHR_TIMEOUT_MS = 5 * 60 * 1000

export type FastUploadResult = Record<string, unknown>

export type FastUploadOptions = {
  file: File
  kind: 'video' | 'creative'
  /** Admin bearer token (required for kind = 'creative'). */
  token?: string | null
  onProgress?: (pct: number) => void
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function xhrSend(
  method: string,
  url: string,
  body: Blob | null,
  headers: Record<string, string>,
  onProgress?: (loaded: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.timeout = XHR_TIMEOUT_MS
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (body && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded)
      }
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload cancelled'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.send(body)
  })
}

async function parseBody(text: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function fastUploadFile({
  file,
  kind,
  token,
  onProgress,
}: FastUploadOptions): Promise<FastUploadResult> {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|m4v|3gp|avi)$/i.test(file.name)
  const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|gif|svg)$/i.test(file.name)

  // ── 1. Fast Direct Cloudflare R2 Presigned Upload (Bypasses all serverless limits) ──
  if (kind === 'creative' && token) {
    try {
      const presignRes = await fetch('/api/admin/r2/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          name: file.name,
          type: file.type || (isVideo ? 'video/mp4' : 'image/png'),
          folder: 'ads',
        }),
      })

      if (presignRes.ok) {
        const presignData = (await presignRes.json()) as { uploadUrl?: string; publicUrl?: string }
        if (presignData.uploadUrl && presignData.publicUrl) {
          const res = await xhrSend(
            'PUT',
            presignData.uploadUrl,
            file,
            { 'Content-Type': file.type || 'application/octet-stream' },
            (loaded) => onProgress?.(Math.min(99, Math.round((loaded / file.size) * 100)))
          )

          if (res.status >= 200 && res.status < 300) {
            onProgress?.(100)
            return {
              url: presignData.publicUrl,
              kind: isVideo ? 'video' : 'image',
              fileName: file.name,
              sizeMB: Math.max(1, Math.round(file.size / (1024 * 1024))),
            }
          }
        }
      }
    } catch (e) {
      console.warn('Direct R2 presigned upload failed, falling back to server route:', e)
    }
  }

  const headers = {
    'Content-Type': file.type || 'application/octet-stream',
    ...authHeaders(token),
  }

  // ── 2. Small files: single request streaming route ──
  if (file.size <= SMALL_FILE_BYTES) {
    const compat = kind === 'video' ? '/api/videos/upload' : '/api/admin/creatives/upload'
    const res = await xhrSend(
      'POST',
      `${compat}?name=${encodeURIComponent(file.name)}`,
      file,
      headers,
      (loaded) => onProgress?.(Math.min(99, Math.round((loaded / file.size) * 100))),
    )
    const body = await parseBody(res.text)
    if (res.status >= 200 && res.status < 300 && !body.error) {
      onProgress?.(100)
      return body
    }
    throw new Error((body.error as string) || `Upload failed (${res.status})`)
  }

  // ── 3. Big files: parallel chunked upload fallback ──
  const initRes = await fetch('/api/uploads/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ name: file.name, size: file.size, kind }),
  })
  const initBody = await parseBody(await initRes.text())
  const uploadId = initBody.uploadId as string | undefined
  const chunkSize = (initBody.chunkSize as number | undefined) ?? 3 * 1024 * 1024
  if (!initRes.ok || !uploadId) {
    throw new Error((initBody.error as string) || 'Upload could not start')
  }

  const offsets: number[] = []
  for (let o = 0; o < file.size; o += chunkSize) offsets.push(o)

  const loaded = new Map<number, number>()
  const report = () => {
    let sum = 0
    for (const v of loaded.values()) sum += v
    onProgress?.(Math.min(99, Math.round((sum / file.size) * 100)))
  }

  let nextIdx = 0
  let failed = false

  const worker = async () => {
    while (!failed && nextIdx < offsets.length) {
      const idx = nextIdx++
      const offset = offsets[idx]
      const blob = file.slice(offset, Math.min(offset + chunkSize, file.size))
      let lastErr: unknown = null

      for (let attempt = 1; attempt <= CHUNK_RETRIES; attempt++) {
        try {
          const res = await xhrSend(
            'PUT',
            `/api/uploads/${uploadId}?offset=${offset}`,
            blob,
            { 'Content-Type': 'application/octet-stream', ...authHeaders(token) },
            (l) => {
              loaded.set(offset, l)
              report()
            },
          )
          if (res.status >= 200 && res.status < 300) {
            loaded.set(offset, blob.size)
            report()
            lastErr = null
            break
          }
          const body = await parseBody(res.text)
          lastErr = new Error((body.error as string) || `Chunk failed (${res.status})`)
          // Client errors (except 429) won't get better by retrying.
          if (res.status < 500 && res.status !== 429) break
        } catch (err) {
          lastErr = err
        }
        if (attempt < CHUNK_RETRIES) await wait(300 * attempt)
      }

      if (lastErr) {
        failed = true
        throw lastErr
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(PARALLEL_CHUNKS, offsets.length) }, () => worker()),
    )
  } catch (err) {
    void fetch(`/api/uploads/${uploadId}`, { method: 'DELETE', headers: authHeaders(token) }).catch(
      () => {},
    )
    throw err instanceof Error ? err : new Error('Upload failed')
  }

  const completeRes = await xhrSend('POST', `/api/uploads/${uploadId}/complete`, null, authHeaders(token))
  const completeBody = await parseBody(completeRes.text)
  if (completeRes.status >= 200 && completeRes.status < 300 && !completeBody.error) {
    onProgress?.(100)
    return completeBody
  }
  throw new Error((completeBody.error as string) || `Upload failed (${completeRes.status})`)
}

/** Toast helper so every upload surface reports failures consistently. */
export function reportUploadError(err: unknown): void {
  toast.error(err instanceof Error ? err.message : 'Upload failed')
}
