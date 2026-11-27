const form = document.querySelector('form')
const submit = form.querySelector('button')
const lock = document.querySelector('#lock')
const status = document.querySelector('[role="status"]')
const root = new URL('../', location.href)

async function send(message) {
  const registration = await navigator.serviceWorker.register(new URL('vault-sw.js', root), { scope: root.pathname })
  const active = (await navigator.serviceWorker.ready).active ?? registration.active
  const reply = new MessageChannel()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('timeout')), 20000)
    reply.port1.onmessage = ({ data }) => {
      clearTimeout(timeout)
      reply.port1.close()
      resolve(data)
    }
    active.postMessage(message, [reply.port2])
  })
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  submit.disabled = true
  status.textContent = '正在验证…'
  try {
    const password = document.querySelector('#password').value
    const accessKey = document.querySelector('#access-key').value.trim()
    const config = await fetch(new URL('sealed/parameters.json', root), { cache: 'no-store' })
    if (!config.ok) throw new Error('configuration')
    const { salt, iterations } = await config.json()
    const { subtle } = crypto
    const bytes = new TextEncoder().encode(JSON.stringify([password, accessKey]))
    const material = await subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey'])
    const key = await subtle.deriveKey({
      name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations
    }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const result = await send({ type: 'unlock', key })
    if (!result.ok) {
      status.textContent = '验证失败。请检查密码和解锁密钥。'
      return
    }
    form.reset()
    location.assign(new URL('reading/', root))
  } catch {
    status.textContent = '暂时无法解锁，请使用支持 Service Worker 的浏览器重新打开。'
  } finally {
    submit.disabled = false
  }
})

lock.addEventListener('click', async () => {
  try {
    if (!(await send({ type: 'lock' })).ok) throw new Error('lock')
    form.reset()
    status.textContent = '博客已锁定。'
  } catch {
    status.textContent = '暂时无法锁定，请关闭此页面并清除该站点的数据。'
  }
})
