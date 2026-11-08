// Minimal service worker: makes the app installable and shows a friendly page
// when a navigation fails offline. It does not cache API data.
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui;padding:2rem;text-align:center">
<h1>You're offline</h1><p>Reconnect and try again. Your draft is saved on this device.</p>
<button onclick="location.reload()" style="font-size:1rem;padding:.75rem 1.25rem;border-radius:.75rem">Retry</button>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  // Navigation preload: the page request starts while this worker is still waking up.
  e.waitUntil(Promise.all([self.clients.claim(), self.registration.navigationPreload?.enable()])),
);

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) ?? (await fetch(event.request));
      } catch {
        return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});
