/* ===== Mandrudi Plattform – Service Worker =====
   Zweck: Die App startet auch ohne Netz (Grundgerüst aus dem Cache) und fühlt sich
   auf dem Home-Bildschirm wie eine App an.

   Strategie bewusst "network-first" für alles Eigene: es wird immer zuerst die
   frische Datei geholt, der Cache ist nur der Notnagel. Damit kann nach einem
   Deploy niemals alter Code hängenbleiben.

   Fremde Hosts (Supabase, jsDelivr-CDN) werden NICHT angefasst – Belege und
   Anmeldedaten laufen unverändert direkt ins Netz. */
var CACHE = "mp-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-180.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Einzeln, damit ein fehlendes Icon nicht die ganze Installation kippt
      return Promise.all(SHELL.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // Supabase & CDN unberührt lassen

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // Seitenaufruf ohne Netz -> gecachte Startseite ausliefern
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
