/* eslint-disable no-console -- PWA lifecycle logging is the point here */
// PWA Service Worker Registration
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  // Dev server: the SW's runtime cache would serve stale Vite modules and break
  // HMR. Install flow is tested against a production build (npm run preview).
  if (!import.meta.env.PROD) {
    console.log('[PWA] Dev mode — service worker registration skipped');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('[PWA] Service Worker registered:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('[PWA] New Service Worker found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            showUpdateNotification();
          }
        });
      });

      // Check for updates every hour
      setInterval(
        () => {
          registration.update();
        },
        60 * 60 * 1000
      );
    } catch (error) {
      console.error('[PWA] Service Worker registration failed:', error);
    }
  });
}

function showUpdateNotification() {
  const notification = document.createElement('div');
  notification.className = 'pwa-update-notification';
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/>
      </svg>
      <div style="flex: 1;">
        <div style="font-weight: 600; margin-bottom: 4px;">Update Available</div>
        <div style="font-size: 13px; opacity: 0.9;">A new version of the app is ready.</div>
      </div>
      <button onclick="window.location.reload()" style="padding: 8px 16px; background: white; color: #4F46E5; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
        Reload
      </button>
      <button onclick="this.closest('.pwa-update-notification').remove()" style="padding: 8px; background: transparent; border: none; cursor: pointer; opacity: 0.7;">
        ✕
      </button>
    </div>
  `;

  document.body.appendChild(notification);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 30000);
}

// ── Install prompt plumbing ───────────────────────────────────────────────────
// Chrome/Edge/Android fire `beforeinstallprompt` when the app is installable.
// The event is stashed so the "Install Aplikasi" card in Pengaturan (classic
// settings.js) can trigger the native prompt on demand via window.erpPwa.
// Safari (iOS + macOS) has no programmatic install API — the settings modal
// shows manual "Add to Home Screen" / "Add to Dock" steps there instead.
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('[PWA] Install prompt captured');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  console.log('[PWA] App installed');
  if (typeof window.showToast === 'function') {
    window.showToast('Aplikasi KELOLA ERP (DEMO) berhasil dipasang 🎉', 'success');
  }
});

// Detect if running as PWA
export function isPWA() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

window.erpPwa = {
  isStandalone: isPWA,
  canPrompt() {
    return !!deferredPrompt;
  },
  // Returns 'accepted' | 'dismissed' | null (no prompt available).
  async promptInstall() {
    if (!deferredPrompt) {
      return null;
    }
    const promptEvent = deferredPrompt;
    // prompt() only works once per event; Chrome fires a fresh
    // beforeinstallprompt later if the user dismissed and the app is
    // still installable, which re-populates deferredPrompt above.
    deferredPrompt = null;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log('[PWA] Install prompt outcome:', outcome);
    return outcome;
  },
};

// Online/Offline detection
export function setupNetworkDetection() {
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    const indicator = document.getElementById('network-indicator') || createNetworkIndicator();

    if (isOnline) {
      indicator.className = 'network-indicator online';
      indicator.textContent = 'Online';
      setTimeout(() => indicator.remove(), 2000);
    } else {
      indicator.className = 'network-indicator offline';
      indicator.textContent = 'Offline - Changes will sync when online';
    }
  }

  function createNetworkIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'network-indicator';
    document.body.appendChild(indicator);
    return indicator;
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}
