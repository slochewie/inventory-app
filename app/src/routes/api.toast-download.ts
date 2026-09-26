import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024
const DOWNLOAD_TTL_MS = 60 * 1000
const DOWNLOAD_DIR = join(tmpdir(), 'inventory-toast-downloads')

type PendingDownloadMetadata = {
  filename: string
  contentType: string
  expiresAt: number
}

export const Route = createFileRoute('/api/toast-download')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await cleanupExpiredDownloads()

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
        const metadata: PendingDownloadMetadata = {
          filename,
          contentType:
            request.headers.get('content-type') || 'application/octet-stream',
          expiresAt: Date.now() + DOWNLOAD_TTL_MS,
        }

        await mkdir(DOWNLOAD_DIR, { recursive: true })
        await Promise.all([
          writeFile(downloadPath(token), bytes),
          writeFile(metadataPath(token), JSON.stringify(metadata), 'utf8'),
        ])

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
        await cleanupExpiredDownloads()

        const url = new URL(request.url)
        const token = url.searchParams.get('token')
        if (!token || !isValidToken(token)) {
          return new Response('Missing or invalid download token', { status: 400 })
        }

        try {
          const [bytes, metadataText] = await Promise.all([
            readFile(downloadPath(token)),
            readFile(metadataPath(token), 'utf8'),
          ])
          const metadata = JSON.parse(metadataText) as PendingDownloadMetadata

          if (metadata.expiresAt <= Date.now()) {
            await removeDownload(token)
            return new Response('Download expired or not found', { status: 404 })
          }

          await removeDownload(token)

          return new Response(bytes, {
            headers: {
              'Content-Type': metadata.contentType,
              'Content-Disposition': 'attachment; filename="' + metadata.filename + '"',
              'Content-Length': String(bytes.byteLength),
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        } catch {
          await removeDownload(token)
          return new Response('Download expired or not found', { status: 404 })
        }
      },
    },
  },
})

async function cleanupExpiredDownloads() {
  await mkdir(DOWNLOAD_DIR, { recursive: true })

  const entries = await readdir(DOWNLOAD_DIR)
  const metadataFiles = entries.filter((entry) => entry.endsWith('.json'))

  await Promise.all(
    metadataFiles.map(async (entry) => {
      const token = entry.slice(0, -'.json'.length)

      if (!isValidToken(token)) {
        await rm(join(DOWNLOAD_DIR, entry), { force: true })
        return
      }

      try {
        const metadata = JSON.parse(
          await readFile(metadataPath(token), 'utf8'),
        ) as PendingDownloadMetadata

        if (metadata.expiresAt <= Date.now()) {
          await removeDownload(token)
        }
      } catch {
        await removeDownload(token)
      }
    }),
  )
}

async function removeDownload(token: string) {
  await Promise.all([
    rm(downloadPath(token), { force: true }),
    rm(metadataPath(token), { force: true }),
  ])
}

function downloadPath(token: string) {
  return join(DOWNLOAD_DIR, token + '.bin')
}

function metadataPath(token: string) {
  return join(DOWNLOAD_DIR, token + '.json')
}

function isValidToken(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value)
}

function sanitizeFilename(value: string) {
  const filename = value
    .replace(/[\\/:"*?<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  return filename || 'Toast-Menu-Template.xlsx'
}
