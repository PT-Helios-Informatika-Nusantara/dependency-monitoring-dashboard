// Minimal service worker: no offline caching, just enough to satisfy
// browser PWA installability criteria (manifest + SW with a fetch handler).
self.addEventListener("fetch", () => {});
