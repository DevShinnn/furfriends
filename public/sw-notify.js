/* Loaded into the generated service worker (see workbox.importScripts in vite.config.js).
   Shows reminders pushed by the send-reminders Edge Function, and opens the app on the right
   page when a reminder is tapped. */
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "FurFriends", {
    body: d.body || "", tag: d.tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png",
    data: { url: d.url || "#/app" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins[0];
    if (win) {
      try { await win.navigate(url); } catch { /* not controlled yet: just focus */ }
      return win.focus();
    }
    return self.clients.openWindow(url);
  })());
});
