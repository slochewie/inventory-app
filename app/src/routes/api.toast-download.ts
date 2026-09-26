import { createFileRoute } from '@tanstack/react-router'

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024
const DOWNLOAD_TTL_MS = 60 * 1000

type PendingDownload = {
  bytes: Uint8Array
  filename: string
  contentType: string
  expiresAt: number
}

const pendingDownloads = new Map<string, PendingDownload>()

export const Route = createFileRoute('/api/toast-download')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        cleanupExpiredDownloads()

        const filename = sanitizeFilename(
          request.headers.get('x-toast-filename') ?? 'Toast-Menu-Template.xlsx',
        )
        const bytes = new Uint8Array(await request.arrayBuffer())

        if (bytes.byteLength === 0) {
          return Response.json({ error: 'Download is empty.' }, { status: 400 })
        }

        if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
          return Response.json({ error: 'Download is too large.' }, { status: 413 })
        }

        const token = crypto.randomUUID()
        pendingDownloads.set(token, {
          bytes,
          filename,
          contentType:
            request.headers.get('content-type') || 'application/octet-stream',
          expiresAt: Date.now() + DOWNLOAD_TTL_MS,
        })

        return Response.json(
          { token },
          {
            headers: {
              'Cache-Control': 'no-store',
            },
          },
        )
      },

      GET: async ({ request }) => {
        cleanupExpiredDownloads()

        const url = new URL(request.url)
        const token = url.searchParams.get('token')
        if (!token) {
          return new Response('Missing download token', { status: 400 })
        }

        const pending = pendingDownloads.get(token)
        if (!pending) {
          return new Response('Download expired or not found', { status: 404 })
        }

        pendingDownloads.delete(token)

        return new Response(pending.bytes, {
          headers: {
            'Content-Type': pending.contentType,
            'Content-Disposition': `attachment; filename="${pending.filename}"`,
            'Content-Length': String(pending.bytes.byteLength),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})

function cleanupExpiredDownloads() {
  const now = Date.now()

  pendingDownloads.forEach((pending, token) => {
    if (pending.expiresAt <= now) pendingDownloads.delete(token)
  })
}

function sanitizeFilename(value: string) {
  const filename = value
    .replace(/[\\/:"*?<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return filename || 'Toast-Menu-Template.xlsx'
}
