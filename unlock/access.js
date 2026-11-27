const form = document.querySelector('#password-form')
const submit = form.querySelector('button')
const file = document.querySelector('#key-file')
const fileChoice = document.querySelector('#file-choice')
const unlocked = document.querySelector('#unlocked')
const download = document.querySelector('#download-key')
const lock = document.querySelector('#lock')
const status = document.querySelector('[role="status"]')
const root = new URL('../', location.href)
const encoder = new TextEncoder()
const keyFormat = 'syn0126-blog-key'
const passwordLabel = encoder.encode('syn0126-blog-key-v2')
let downloadUrl

function fromBase64(text) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
}

async function send(message) {
  const registration = await navigator.serviceWorker.register(new URL('vault-sw.js', root), { scope: root.pathname })
  const active = (await navigator.serviceWorker.ready).active ?? registration.active
  const reply = new MessageChannel()
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reply.port1.close()
      reject(new Error('Service worker timeout'))
    }, 20000)
    reply.port1.onmessage = ({ data }) => {
      clearTimeout(timeout)
      reply.port1.close()
      resolve(data)
    }
    active.postMessage(message, [reply.port2])
  })
}

async function readPasswordKey(password) {
  const config = await fetch(new URL('sealed/parameters.json', root), { cache: 'no-store' })
  if (!config.ok) throw new Error('Missing vault configuration')
  const { version, salt, iterations, wrappedKey } = await config.json()
  if (version !== 2) throw new Error('Incompatible vault version')
  const { subtle } = crypto
  const material = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  const wrappingKey = await subtle.deriveKey({
    name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations
  }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  const wrapped = fromBase64(wrappedKey)
  return new Uint8Array(await subtle.decrypt({
    name: 'AES-GCM', iv: wrapped.subarray(0, 12), additionalData: passwordLabel
  }, wrappingKey, wrapped.subarray(12)))
}

async function unlockWithKey(bytes) {
  if (bytes.length !== 32) return false
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt'])
  return (await send({ type: 'unlock', key })).ok
}

function discardDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = undefined
  download.removeAttribute('href')
}

function showUnlockOptions() {
  discardDownload()
  form.reset()
  form.hidden = false
  fileChoice.hidden = false
  unlocked.hidden = true
}

function offerDownload(bytes) {
  discardDownload()
  const key = btoa(String.fromCharCode(...bytes))
  const body = JSON.stringify({ format: keyFormat, version: 1, key })
  downloadUrl = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  download.href = downloadUrl
  form.hidden = true
  fileChoice.hidden = true
  unlocked.hidden = false
  download.focus()
}

function setBusy(busy) {
  submit.disabled = busy
  file.disabled = busy
  lock.disabled = busy
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setBusy(true)
  status.textContent = '正在验证…'
  let bytes
  try {
    bytes = await readPasswordKey(document.querySelector('#password').value)
    if (!await unlockWithKey(bytes)) throw new Error('Vault could not open')
    form.reset()
    offerDownload(bytes)
    status.textContent = '博客已解锁。'
  } catch (error) {
    status.textContent = error.name === 'OperationError'
      ? '密码不正确。' : '暂时无法解锁，请刷新后重试。'
  } finally {
    bytes?.fill(0)
    setBusy(false)
  }
})

file.addEventListener('change', async () => {
  const selected = file.files[0]
  if (!selected) return
  setBusy(true)
  status.textContent = '正在读取本机钥匙文件…'
  let bytes
  try {
    if (selected.size > 512) throw new Error('Invalid key file size')
    const { format, version, key } = JSON.parse(await selected.text())
    if (format !== keyFormat || version !== 1 || !/^[A-Za-z0-9+/]{43}=$/.test(key ?? '')) {
      throw new Error('Invalid key file')
    }
    bytes = fromBase64(key)
    if (!await unlockWithKey(bytes)) throw new Error('Old or incorrect key file')
    location.assign(new URL('reading/', root))
  } catch {
    status.textContent = '钥匙文件无效或已过期。你可以用密码进入。'
  } finally {
    bytes?.fill(0)
    file.value = ''
    setBusy(false)
  }
})

lock.addEventListener('click', async () => {
  setBusy(true)
  try {
    if (!(await send({ type: 'lock' })).ok) throw new Error('Lock failed')
    showUnlockOptions()
    status.textContent = '博客已锁定。'
  } catch {
    status.textContent = '暂时无法锁定，请清除该站点的数据。'
  } finally {
    setBusy(false)
  }
})
window.addEventListener('pagehide', () => {
  showUnlockOptions()
  status.textContent = ''
})
