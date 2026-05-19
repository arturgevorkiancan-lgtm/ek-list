import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSW } from 'workbox-build'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = resolve(root, 'dist')

await generateSW({
  globDirectory: dist,
  globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
  swDest: resolve(dist, 'sw.js'),
  // development mode avoids workbox-build terser race (Vite 8 + large bundles)
  mode: 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/xcldnsbnzuplsrwahrcf\.supabase\.co\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'supabase-cache',
        expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
      },
    },
  ],
})

const swPath = resolve(dist, 'sw.js')
let sw = await readFile(swPath, 'utf8')
const pushHandlers = `
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'ЧЕК-Лист', {
      body: data.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag ?? 'checklist',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
`
if (!sw.includes("addEventListener('push'")) {
  sw += pushHandlers
  await writeFile(swPath, sw)
}

console.log('Generated dist/sw.js')
