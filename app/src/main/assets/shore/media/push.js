function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function pushConfig() {
  return window.serverData[getCurrentServerUrl()]?.push;
}
async function postSubscription(sub) {
  let json = sub.toJSON();
  return backendfetch('/api/v1/me/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
    passstatus: true
  });
}
export async function enableWebPush() {
  if (!('serviceWorker' in navigator)||!('PushManager' in window)) return false;
  let cfg = pushConfig();
  if (!cfg?.enabled||!cfg.vapid_public_key) return false;
  let perm = await Notification.requestPermission();
  if (perm!=='granted') return false;
  let reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  // Always re-subscribe with the current server's key (one push subscription per registration)
  let existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe().catch(()=>{});
  let sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.vapid_public_key) });
  let res = await postSubscription(sub);
  if (res.status>=400) return false;
  localStorage.setItem('pwebpush', 'true');
  return true;
}
export async function disableWebPush() {
  localStorage.setItem('pwebpush', 'false');
  if (!('serviceWorker' in navigator)) return;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  let endpoint = sub.endpoint;
  await sub.unsubscribe().catch(()=>{});
  backendfetch('/api/v1/me/push', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint })
  });
}
export async function syncWebPush() {
  // On login, re-register the existing subscription with the current server so it keeps receiving pushes
  if (localStorage.getItem('pwebpush')!=='true') return;
  if (!('serviceWorker' in navigator)||!('PushManager' in window)||Notification.permission!=='granted') return;
  let cfg = pushConfig();
  if (!cfg?.enabled||!cfg.vapid_public_key) return;
  let reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.vapid_public_key) });
  postSubscription(sub);
}
