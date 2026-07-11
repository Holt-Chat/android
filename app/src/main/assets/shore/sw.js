// Holt service worker - background Web Push notifications
// Payload carries only sender/channel (messages are end-to-end encrypted, the server never sees content)
self.addEventListener('push', (event)=>{
  let data = {};
  try { data = event.data?event.data.json():{}; } catch(e) {}
  let title = data.title||'Holt';
  let options = {
    body: 'New message',
    icon: './media/holt.png',
    badge: './favicon.ico',
    tag: data.channel_id?'holt-'+data.channel_id:'holt',
    renotify: true,
    data: { channel_id: data.channel_id||null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', (event)=>{
  event.notification.close();
  event.waitUntil((async()=>{
    let all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (let client of all) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow('./');
  })());
});
