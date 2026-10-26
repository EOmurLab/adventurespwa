'use strict';
// Adventures: keeps the app files on the device so the page can open without a connection.
// Google sign-in and Google Drive are never touched here; they always go straight to the network.
var CACHE = 'adventures-shell-v1';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'apple-touch-icon.png', 'adventures-logo.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // one by one: a file that is missing must not stop the others from being saved
      return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('adventures-shell-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache() {
  return caches.match('index.html').then(function (r) { return r || caches.match('./'); });
}
function fromNetwork(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { return c.put('index.html', copy); }).catch(function () {});
    }
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // everything from Google passes straight through

  if (req.mode === 'navigate') {
    // newest page when the network answers, the saved page when it does not (or takes longer than 4 seconds)
    e.respondWith(new Promise(function (resolve) {
      var done = false;
      function finish(r) { if (done || !r) return false; done = true; resolve(r); return true; }
      var timer = setTimeout(function () { fromCache().then(finish); }, 4000);
      fromNetwork(req).then(function (res) { clearTimeout(timer); finish(res); }, function () {
        clearTimeout(timer);
        fromCache().then(function (r) { if (!finish(r)) { done = true; resolve(Response.error()); } });
      });
    }));
    return;
  }

  // icons and the like: show the saved file at once, refresh it quietly in the background
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () { return hit || Response.error(); });
    return hit || net;
  }));
});
