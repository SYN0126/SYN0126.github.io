const avatar = document.querySelector('.monogram')
const entry = document.getElementById('personal-link')
const activationWindowMs = 3500
let firstPress = 0
let presses = 0

avatar.addEventListener('click', () => {
  if (!entry.hidden) return

  const now = performance.now()
  if (presses === 0 || now - firstPress > activationWindowMs) {
    firstPress = now
    presses = 0
  }

  presses += 1
  if (presses !== 5) return

  const link = document.createElement('a')
  link.href = './unlock/'
  link.textContent = '进入炫光版'
  link.rel = 'noreferrer'
  entry.replaceChildren(link)
  entry.hidden = false
  avatar.setAttribute('aria-expanded', 'true')
  link.focus()
})
