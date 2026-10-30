// Web push handlers, pulled into the generated service worker via
// workbox.importScripts (see vite.config.ts). Payload from evaluate-session:
// { title, body, url, tag }.

self.addEventListener('push', (event) => {
  let msg = { title: 'Tether', body: '', url: '/', tag: undefined }
  try {
    msg = { ...msg, ...event.data.json() }
  } catch {
    if (event.data) msg.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      requireInteraction: true,
      data: { url: msg.url },
    }),
  )
})

// Tap: focus an open Tether window on that page, or open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => new URL(w.url).origin === self.location.origin)
      if (same) return same.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w))
      return self.clients.openWindow(url)
    }),
  )
})
