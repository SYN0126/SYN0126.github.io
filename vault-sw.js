const root = new URL(self.registration.scope)
const encode = new TextEncoder()
const decode = new TextDecoder()
const fourHours = 4 * 60 * 60 * 1000
let sessionPromise

function useStorage(mode, action) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('blog-unlock', 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore('session')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const db = opening.result
      const transaction = db.transaction('session', mode)
      const request = action(transaction.objectStore('session'))
      transaction.oncomplete = () => { db.close(); resolve(request.result) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    }
  })
}

async function readSealed(name, label, key) {
  const response = await fetch(new URL('sealed/' + name, root), { cache: 'no-store' })
  if (!response.ok) throw new Error('Encrypted asset unavailable')
  const bytes = new Uint8Array(await response.arrayBuffer())
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encode.encode(label) },
    key,
    bytes.subarray(12)
  )
}

async function restoreSession() {
  const stored = await useStorage('readonly', (store) => store.get('active'))
  if (!stored || stored.expires <= Date.now()) return null
  const manifest = JSON.parse(decode.decode(await readSealed('index.bin', 'manifest', stored.key)))
  return { ...stored, manifest }
}

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('message', (event) => {
  const reply = event.ports[0]
  const source = event.source?.url
  if (!reply || !source || !new URL(source).pathname.startsWith(root.pathname + 'unlock/')) return
  const { type, key } = event.data ?? {}
  const operate = async () => {
    if (type === 'unlock') {
      const manifest = JSON.parse(decode.decode(await readSealed('index.bin', 'manifest', key)))
      const expires = Date.now() + fourHours
      await useStorage('readwrite', (store) => store.put({ key, expires }, 'active'))
      sessionPromise = Promise.resolve({ key, expires, manifest })
    } else if (type === 'lock') {
      sessionPromise = Promise.resolve(null)
      await useStorage('readwrite', (store) => store.delete('active'))
    } else {
      throw new Error('Unknown action')
    }
  }
  event.waitUntil(operate().then(() => reply.postMessage({ ok: true }), () => reply.postMessage({ ok: false })))
})

function normalizedPath(path) {
  try { return path.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/') }
  catch { return path }
}

const publicFiles = new Set(['', 'index.html', 'home.css', 'home.js', 'vault-sw.js', 'robots.txt', '404.html', '.nojekyll'])
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return
  if (request.method !== 'GET' && request.method !== 'HEAD') return
  const relative = url.pathname.slice(root.pathname.length)
  if (publicFiles.has(relative) || relative.startsWith('unlock/') || relative.startsWith('sealed/')) return
  event.respondWith((async () => {
    sessionPromise ??= restoreSession().catch(() => null)
    const session = await sessionPromise
    if (!session || session.expires <= Date.now()) {
      if (relative === 'reading/' || relative === 'reading') return Response.redirect(new URL('unlock/', root), 302)
      return fetch(request)
    }
    const clean = normalizedPath(relative).replace(/\/$/, '')
    const path = clean === 'reading' ? 'index.html' : clean
    const name = Object.hasOwn(session.manifest, path) ? path
      : Object.hasOwn(session.manifest, path + '/index.html') ? path + '/index.html'
        : Object.hasOwn(session.manifest, path + '.html') ? path + '.html' : null
    if (!name) return fetch(request)
    const [blob, contentType] = session.manifest[name]
    try {
      const body = request.method === 'HEAD' ? null : await readSealed(blob, name, session.key)
      return new Response(body, { headers: {
        'content-type': contentType, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer'
      } })
    } catch {
      sessionPromise = undefined
      return new Response('无法读取博客。请重新解锁。', { status: 503 })
    }
  })())
})
