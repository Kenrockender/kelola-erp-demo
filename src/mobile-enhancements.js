// Mobile Touch Enhancements
// Improves mobile UX with touch gestures and interactions

export function initMobileEnhancements() {
  // Pull-to-refresh (mobile only)
  if ('ontouchstart' in window && window.innerWidth <= 768) {
    setupPullToRefresh();
  }

  // Swipe gestures
  setupSwipeGestures();

  // Touch feedback
  setupTouchFeedback();

  // Prevent double-tap zoom on buttons
  preventDoubleTapZoom();

  // Improve scrolling
  improveScrolling();
}

// Pull-to-refresh functionality
function setupPullToRefresh() {
  // Skip custom PTR on iOS standalone (Safari PWA has native pull-to-refresh)
  const isIOSStandalone =
    ('standalone' in navigator && navigator.standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent);
  if (isIOS && isIOSStandalone) {
    return;
  }

  let startY = 0;
  let currentY = 0;
  let pulling = false;

  const content = document.querySelector('.content');
  if (!content) {
    return;
  }

  let indicator = document.querySelector('.ptr-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'ptr-indicator';
    indicator.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <span>Tarik untuk muat ulang</span>
    `;
    document.body.appendChild(indicator);
  }

  const label = indicator.querySelector('span');

  // Ensure indicator is hidden on creation
  indicator.style.opacity = '0';
  indicator.style.visibility = 'hidden';

  content.addEventListener(
    'touchstart',
    e => {
      if (content.scrollTop === 0) {
        startY = e.touches[0].pageY;
        pulling = true;
        // Follow the finger 1:1 — no transition while dragging.
        indicator.style.transition = 'none';
      }
    },
    { passive: true }
  );

  content.addEventListener(
    'touchmove',
    e => {
      if (!pulling) {
        return;
      }

      currentY = e.touches[0].pageY;
      const diff = currentY - startY;

      if (diff > 10) {
        // Show indicator once user starts pulling down
        indicator.style.opacity = '1';
        indicator.style.visibility = 'visible';
      }

      if (diff > 0 && diff < 100) {
        indicator.classList.remove('active');
        // Slide the pill down from above as the user pulls (clamped at the top).
        indicator.style.transform = `translateX(-50%) translateY(${diff - 100}px)`;
        label.textContent = 'Tarik untuk muat ulang';
      } else if (diff >= 100) {
        indicator.classList.add('active');
        indicator.style.transform = 'translateX(-50%) translateY(0)';
        label.textContent = 'Lepas untuk muat ulang';
      }
    },
    { passive: true }
  );

  content.addEventListener('touchend', () => {
    if (!pulling) {
      return;
    }

    const diff = currentY - startY;
    // Animate the snap (either staying down to refresh, or sliding back up).
    indicator.style.transition =
      'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.28s ease';

    if (diff >= 100) {
      indicator.classList.add('refreshing');
      indicator.classList.remove('active');
      indicator.style.transform = 'translateX(-50%) translateY(0)';
      label.textContent = 'Memuat ulang…';
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      indicator.classList.remove('active');
      indicator.style.opacity = '0';
      indicator.style.transform = 'translateX(-50%) translateY(-160%)';
      // Fully hide after animation
      setTimeout(() => {
        indicator.style.visibility = 'hidden';
      }, 300);
    }

    pulling = false;
    startY = 0;
    currentY = 0;
  });
}

// Swipe gestures for navigation
function setupSwipeGestures() {
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let touchEndY = 0;

  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main');

  if (!main) {
    return;
  }

  main.addEventListener(
    'touchstart',
    e => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    },
    { passive: true }
  );

  main.addEventListener(
    'touchend',
    e => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    },
    { passive: true }
  );

  function handleSwipe() {
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(diffX) > Math.abs(diffY)) {
      // Swipe right - open sidebar
      if (diffX > 100 && touchStartX < 50 && window.innerWidth <= 768) {
        sidebar?.classList.add('open');
        document.getElementById('sidebar-backdrop')?.classList.add('open');
      }
      // Swipe left - close sidebar
      else if (diffX < -100 && sidebar?.classList.contains('open')) {
        sidebar?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('open');
      }
    }
  }
}

// Touch feedback for better UX
function setupTouchFeedback() {
  const interactiveElements = document.querySelectorAll('button, a, .card, .nav-btn');

  interactiveElements.forEach(element => {
    element.addEventListener(
      'touchstart',
      function () {
        this.style.transform = 'scale(0.98)';
        this.style.opacity = '0.8';
      },
      { passive: true }
    );

    element.addEventListener(
      'touchend',
      function () {
        this.style.transform = '';
        this.style.opacity = '';
      },
      { passive: true }
    );

    element.addEventListener(
      'touchcancel',
      function () {
        this.style.transform = '';
        this.style.opacity = '';
      },
      { passive: true }
    );
  });
}

// Prevent double-tap zoom on buttons
function preventDoubleTapZoom() {
  let lastTouchEnd = 0;

  document.addEventListener(
    'touchend',
    e => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

// Improve scrolling performance
function improveScrolling() {
  // Add momentum scrolling for iOS
  const scrollableElements = document.querySelectorAll('.content, .modal-content, .sidebar');
  scrollableElements.forEach(element => {
    element.style.webkitOverflowScrolling = 'touch';
  });

  // Smooth scroll to top button
  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.className = 'scroll-top-btn';
  scrollTopBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  `;
  scrollTopBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
    cursor: pointer;
    opacity: 0;
    transform: translateY(100px);
    transition: all 0.3s ease;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  document.body.appendChild(scrollTopBtn);

  const content = document.querySelector('.content');
  if (content) {
    content.addEventListener('scroll', () => {
      if (content.scrollTop > 300) {
        scrollTopBtn.style.opacity = '1';
        scrollTopBtn.style.transform = 'translateY(0)';
      } else {
        scrollTopBtn.style.opacity = '0';
        scrollTopBtn.style.transform = 'translateY(100px)';
      }
    });
  }

  scrollTopBtn.addEventListener('click', () => {
    content?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  });
}

// Haptic feedback (if supported)
export function triggerHaptic(type = 'light') {
  if ('vibrate' in navigator) {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'heavy':
        navigator.vibrate(30);
        break;
      case 'success':
        navigator.vibrate([10, 50, 10]);
        break;
      case 'error':
        navigator.vibrate([20, 100, 20]);
        break;
    }
  }
}

// Detect device type
export function getDeviceType() {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (
    /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(
      ua
    )
  ) {
    return 'mobile';
  }
  return 'desktop';
}

// Orientation change handler
export function setupOrientationHandler() {
  window.addEventListener('orientationchange', () => {
    // Adjust layout based on orientation
    const isLandscape = window.orientation === 90 || window.orientation === -90;
    document.body.classList.toggle('landscape', isLandscape);

    // Announce to screen readers
    const liveRegion = document.getElementById('live-region');
    if (liveRegion) {
      liveRegion.textContent = `Orientation changed to ${isLandscape ? 'landscape' : 'portrait'}`;
    }
  });
}

// Initialize all enhancements
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileEnhancements);
  } else {
    initMobileEnhancements();
  }

  setupOrientationHandler();
}
