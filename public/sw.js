// Service Worker（PWA用）
// - プッシュ通知を受け取ってバナーを出す。タップで該当の画面を開く
// - Android・PC では「完了にする」ボタン（タスク）。iPhone はボタン非対応なのでタップで開く
// - CSS・JS・アイコンはキャッシュして、2回目から速く開く（画面のデータは毎回サーバーから取る）
const CACHE = 'haruharu-v6';
const ASSETS = ['/assets/app.css', '/assets/app.js', '/assets/ill.js', '/icons/icon-192.png', '/icons/icon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// /assets と /icons だけキャッシュを使う（新しいものがあれば裏で取り直す）。それ以外は常にネットワーク
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (!url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/icons/')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      const net = fetch(event.request).then((res) => { if (res.ok) cache.put(event.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});

// プッシュ通知を受け取ったらバナーを出す（中身はサーバーから送る）
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    lang: 'ja',
    data: { url: data.url || '/', doneToken: data.doneToken || null },
  };
  if (Array.isArray(data.actions) && data.doneToken) options.actions = data.actions;
  event.waitUntil(
    self.registration.showNotification(data.title || '就活日和', options).then(() => {
      if (self.navigator && 'setAppBadge' in self.navigator) return self.navigator.setAppBadge().catch(() => {});
    })
  );
});

// 通知をタップしたら、該当のページを開く（開いている画面があればそこで開く）
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, doneToken } = event.notification.data || {};
  if (event.action === 'done' && doneToken) {
    event.waitUntil(
      fetch('/api/push/done', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: doneToken }) })
        .then((res) => self.registration.showNotification('完了にしました', { body: 'タスクを完了にしました', icon: '/icons/icon-192.png', tag: 'done', lang: 'ja' }).then(() => res))
        .then(() => self.registration.getNotifications({ tag: 'done' }))
        .then((ns) => setTimeout(() => ns.forEach((n) => n.close()), 3000))
        .catch(() => {})
    );
    return;
  }
  const target = new URL(url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          c.postMessage({ type: 'open', url: target });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
