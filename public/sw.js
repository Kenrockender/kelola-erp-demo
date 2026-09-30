// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SERVICE WORKER v3.0 â€” KELOLA ERP (DEMO)
// Advanced caching strategies Â· Background sync Â· Push notifications Â· Offline support
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Bumped to v3.2.7 to purge stale RUNTIME_CACHE entries so returning users pick
// up the merged set of changes: (1) Firebase Auth migration (auth.js) + sync-
// status indicator + db.js sync of all document-flow collections; (2) the
// xlsx-export.js / budget-gl-extras.js / sales-purchase-extras.js loader fix
// (Bulk Surat Jalan "Download Excel" + budget/payroll/DP features); and (3) the
// pagination/sort/filter re-render fix (refreshActiveView invalidates the
// navigate() view cache). Without this bump, stale-while-revalidate serves the
// previous classic JS to returning users for one extra reload.
// Bumped to v3.4.0 for the marketing landing page: `/` (+ /index.html) now
// precache the static landing front door, and the ERP app shell moved to
// /app.html (served at /app). Without this bump returning users would keep the
// old root=app shell from the previous runtime cache for one extra reload.
// Bumped to v3.4.7: dashboard Penjualan/Pembelian widgets now match Accurate —
// headline/paid/unpaid use the pre-tax DPP basis and bucket by document-number
// period (fixes PI date drift), Outstanding stays on the tax-inclusive owing basis.
// Bumped to v3.6.0: real multi-user RBAC — per-user roles (users/{uid}),
// role-based firestore.rules, and client menu/button gating + saveDB net. The
// classic bundle now includes rbac.js, so returning users must drop the old one.
// Bumped to v3.6.1: sidebar/user-chip name restored to the configured profile
// name (not the email prefix); Manajemen Pengguna moved into the user menu.
// Bumped to v3.6.2: department→role access — Employee gets Email + Department,
// Manajemen Pengguna can manage departments + sync roles from them.
// Bumped to v3.6.3: mobile topbar menus (overflow/user/notif) re-parented to
// <body> — topbar's backdrop-filter trapped their position:fixed, stranding
// the bottom sheets above the viewport.
// Bumped to v3.7.0: PWA install — real 192/512/maskable icons (manifest was
// pointing at a 126x139 png, below Chrome's installability minimum), service
// worker finally registered from main.js, and an "Install Aplikasi" card in
// Pengaturan (native prompt on Chrome/Edge/Android, manual steps for Safari).
// Bumped to v3.7.1: mobile table filter dropdowns re-parented to <body> while
// open — the .card backdrop-filter trapped their position:fixed bottom-sheet,
// anchoring the sheet to the card instead of the viewport (same fix as v3.6.3).
// Bumped to v3.7.2: "Install Aplikasi" added to the user menu (avatar dropdown)
// so every role can install the PWA — it was previously only in Pengaturan,
// which RBAC hides from non-admin/manajer users, leaving them no install entry.
// Bumped to v3.7.3: PWA icons regenerated from the real app logo (logo-nusantara-sq.png,
// the blue "N") on a plain white background, replacing the cyan redraw — bump
// purges the cached old icons so returning users pick up the new ones.
// Bumped to v3.7.4: PWA icons regenerated from the new NSA 2.0 brand mark
// (white "N" on blue gradient tile) — bump purges the previous cached icons.
// Bumped to v3.7.5: logo-nusantara-sq.png (in-app sidebar/login/favicon/og:image logo)
// also regenerated from the NSA 2.0 mark for brand consistency — bump purges the
// old cached logo so returning users see the new one.
// Bumped to v3.7.6: GL seed (Accurate journals + chart of accounts) now loads
// from the auth-gated glSeed Firestore collection instead of the public
// accurate-data.json (Phase 1 — adds loadGlSeed + one-time migration helper).
// Bumped to v3.7.7: Phase 2 — public accurate-data.json + import.html DELETED
// (no longer served, leak closed), JSON fetch + reseed machinery removed from
// db.js/main.js, and the deprecated apple-mobile-web-app-capable meta paired
// with the standard mobile-web-app-capable.
// Bumped to v1.1.0: the 7 heaviest view-tier modules (ledger, financials,
// quotations, returns, warehouse, adjustments, invoices) are split out of the
// core classic bundle into on-demand /classic/view-<id>.js chunks (lazy-views.js).
// Returning users must drop the old monolithic bundle.js; the split chunks are
// runtime-cached (stale-while-revalidate) on first navigation to each view.
// Bumped to v1.1.1: three NSA-parity reports — Laporan Umur Piutang (AR aging) on
// the Finance page, Kartu Stok (per-item movement card in the item detail), and
// Kartu Piutang/Hutang (per-party running statement in the customer/supplier
// detail). Cache bust so returning users pick up the updated classic bundle.
// Bumped to v1.1.2: Notifikasi Sistem settings card — requests OS Notification
// permission and sends a test notification, wiring up the existing alert
// scheduler (notifications.js) that had no UI entry point to grant permission.
// Bumped to v1.1.3: fixed the activate-cleanup filter, which was still matching
// the pre-rebrand 'stone-erp-' cache prefix instead of 'nusantara-erp-' and so
// never actually deleted old-version runtime caches. Paired with a firebase.json
// change (classic/** and other non-hashed JS/CSS now `no-cache` instead of a
// 1-year max-age) so returning users' HTTP cache stops shadowing fresh deploys —
// previously a deploy could go live but browsers kept serving year-old
// /classic/*.js indefinitely regardless of this file's version bump.
/* eslint-disable no-console -- service worker lifecycle logging is the point here */
// Rebranded to Kelola ERP (Demo) — cache prefix bumped from nusantara-erp- to
// kelola-erp- so a returning browser doesn't try to reuse the old cache entries.
const CACHE_VERSION = 'v1.1.3';
const CACHE_NAME = `kelola-erp-${CACHE_VERSION}`;
const RUNTIME_CACHE = `kelola-erp-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `kelola-erp-images-${CACHE_VERSION}`;
const API_CACHE = `kelola-erp-api-${CACHE_VERSION}`;

// Cache duration in milliseconds
const CACHE_DURATION = {
  images: 30 * 24 * 60 * 60 * 1000, // 30 days
  api: 5 * 60 * 1000, // 5 minutes
  static: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// Assets to cache on install. Only paths that exist in BOTH dev and the Vite
// production build — hashed bundles (/assets/*) are picked up by the runtime
// stale-while-revalidate cache instead. cache.addAll() rejects the whole
// install if a single entry 404s, so each asset is cached individually below.
const PRECACHE_ASSETS = [
  '/', // landing page (dist/index.html)
  '/index.html', // landing page (explicit)
  '/app', // app shell (rewrite → /app.html)
  '/app.html', // app shell (direct)
  '/manifest.json',
  '/logo-kelola-sq.png',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

// Install event - cache core assets
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker v3.0...');

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        // Cache each asset independently so one missing file can't fail install.
        return Promise.all(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Precache skipped for', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Skip waiting');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker v3.0...');

  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => {
              return (
                (name.startsWith('kelola-erp-') || name.startsWith('nusantara-erp-')) &&
                name !== CACHE_NAME &&
                name !== RUNTIME_CACHE &&
                name !== IMAGE_CACHE &&
                name !== API_CACHE
              );
            })
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - advanced caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests except for known CDNs
  if (
    url.origin !== self.location.origin &&
    !url.origin.includes('googleapis.com') &&
    !url.origin.includes('gstatic.com')
  ) {
    return;
  }

  // Choose strategy based on request type
  if (request.method !== 'GET') {
    // Network only for non-GET requests
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/)) {
    // Cache first for images
    event.respondWith(cacheFirst(request, IMAGE_CACHE, CACHE_DURATION.images));
  } else if (url.pathname.includes('/api/') || url.origin.includes('firestore.googleapis.com')) {
    // Network first with cache fallback for API calls
    event.respondWith(networkFirst(request, API_CACHE, CACHE_DURATION.api));
  } else if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
    // Stale while revalidate for static assets
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  } else {
    // Network first for HTML and other content
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
  }
});

/**
 * Cache First Strategy
 * Try cache first, fallback to network
 */
async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Check if cache is still fresh
    const cachedDate = new Date(cached.headers.get('date'));
    const now = new Date();

    if (now - cachedDate < maxAge) {
      return cached;
    }
  }

  try {
    const response = await fetch(request);

    if (response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    // Return stale cache if network fails
    if (cached) {
      return cached;
    }

    // Return offline page
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Network First Strategy
 * Try network first, fallback to cache
 */
async function networkFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      // Only cache successful responses
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request);

    if (cached) {
      // Check if cache is still acceptable
      if (maxAge) {
        const cachedDate = new Date(cached.headers.get('date'));
        const now = new Date();

        if (now - cachedDate > maxAge) {
          console.warn('[SW] Serving stale cache for:', request.url);
        }
      }

      return cached;
    }

    // Return offline response
    return new Response('Offline - No cached version available', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

/**
 * Stale While Revalidate Strategy
 * Return cache immediately, update cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  });

  return cached || fetchPromise;
}

// Background Sync - for offline form submissions
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  try {
    // Get pending sync items from IndexedDB
    console.log('[SW] Syncing offline data...');

    // Notify clients of sync completion
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        timestamp: Date.now(),
      });
    });
  } catch (error) {
    console.error('[SW] Sync failed:', error);
    throw error; // Retry sync
  }
}

// Push Notifications
self.addEventListener('push', event => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Kelola ERP';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Close' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification Click
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }

      // Open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Message handler for client communication
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(cacheNames.map(name => caches.delete(name)));
      })
    );
  }

  if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then(size => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

// Get total cache size
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return totalSize;
}

// Periodic cache cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCaches());
  }
});

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      const cachedDate = new Date(response.headers.get('date'));
      const now = new Date();

      // Remove entries older than 30 days
      if (now - cachedDate > 30 * 24 * 60 * 60 * 1000) {
        await cache.delete(request);
      }
    }
  }
}

// â”€â”€ Push notification handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Receive message from page (notifications.js postMessage)
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') {
    return;
  }
  const { title, body, tag, icon } = event.data;
  event.waitUntil(
    self.registration.showNotification(title || 'Kelola ERP', {
      body: body || '',
      tag: tag || 'kelola-notif',
      icon: icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
    })
  );
});

// Server-push (future VAPID integration)
self.addEventListener('push', event => {
  let data = { title: 'Kelola ERP', body: '' };
  try {
    data = event.data ? event.data.json() : data;
  } catch (_) {
    /* ignore — fall back to default payload */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || 'kelola-push',
      icon: '/icons/icon-192x192.png',
    })
  );
});

// Focus app window when notification is clicked
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

console.log('[SW] Kelola ERP (Demo) Service Worker v3.2.17 loaded');
