/* Web push: lets reminders arrive when the app is closed. The browser gives each device a push
   address; the store saves it to Supabase, and the send-reminders Edge Function pushes to it.
   Needs VITE_VAPID_PUBLIC_KEY and the installed service worker (production builds only). */

export const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

export const pushConfigured = () =>
  !!VAPID_PUBLIC && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

const toBytes = (b64url) => {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/* This device's push subscription as plain data for the database, creating it if needed.
   Resolves to null when push can't work here (no service worker, no permission, not configured). */
export async function getPushSubscription(create = true) {
  if (!pushConfigured() || Notification.permission !== "granted") return null;
  // Wait for the service worker to be active: on a first visit it may still be installing,
  // and subscribing before then fails. Dev builds have no worker, so give up after a while.
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))]);
  if (!reg) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC) });
  if (!sub) return null;
  const { endpoint, keys } = sub.toJSON();
  return {
    endpoint, p256dh: keys.p256dh, auth: keys.auth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila",
    userAgent: navigator.userAgent.slice(0, 200),
  };
}

/* Stops push on this device. Resolves to the endpoint that was removed, if any. */
export async function dropPushSubscription() {
  if (!pushConfigured()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const { endpoint } = sub;
  await sub.unsubscribe();
  return endpoint;
}
