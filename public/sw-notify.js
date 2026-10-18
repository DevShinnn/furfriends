/* Loaded into the generated service worker (see workbox.importScripts in vite.config.js).
   Tapping a reminder notification opens the app on the right page. */
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
