// Mobile UI wiring — hamburger sidebar drawer + topbar overflow menu.
// Extracted from inline <script> blocks into an external file so the CSP
// script-src can stay 'self' (no 'unsafe-inline'). Loaded after the DOM/body
// is present (script tag sits at the end of <body>), so element lookups resolve.

// ── Hamburger Menu Toggle (mobile sidebar drawer) ───────────────────────────────
(function () {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!hamburger || !sidebar || !backdrop) {
    return;
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('sidebar-open');
  }

  // Force-close sidebar on mobile (in case main.js opens it)
  if (isMobile()) {
    closeSidebar();
  }

  // Also observe sidebar for class changes (main.js might add 'open')
  const sidebarObserver = new MutationObserver(function (_mutations) {
    if (isMobile() && sidebar.classList.contains('open') && !hamburger.classList.contains('open')) {
      // Sidebar was opened by external JS, sync the UI
      backdrop.classList.add('open');
      hamburger.classList.add('open');
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.classList.add('sidebar-open');
    }
  });
  sidebarObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });

  // Toggle on hamburger click
  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // Close on backdrop click
  backdrop.addEventListener('click', closeSidebar);

  // Close on nav item click (mobile)
  sidebar.querySelectorAll('.rail-item').forEach(function (item) {
    item.addEventListener('click', function () {
      if (isMobile()) {
        closeSidebar();
      }
    });
  });

  // Close on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });

  // Close on swipe left on sidebar
  let touchStartX = 0;
  sidebar.addEventListener(
    'touchstart',
    function (e) {
      touchStartX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  sidebar.addEventListener(
    'touchend',
    function (e) {
      const diff = touchStartX - e.changedTouches[0].screenX;
      if (diff > 60 && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    },
    { passive: true }
  );

  // Handle resize
  window.addEventListener('resize', function () {
    if (!isMobile() && sidebar.classList.contains('open')) {
      closeSidebar();
    }
    // Re-ensure sidebar is hidden on mobile
    if (isMobile() && !sidebar.classList.contains('open')) {
      backdrop.classList.remove('open');
      hamburger.classList.remove('open');
      document.body.classList.remove('sidebar-open');
    }
  });
})();

// ── Topbar Overflow Menu (mobile) ───────────────────────────────────────────────
(function () {
  const overflowBtn = document.getElementById('topbar-overflow');
  const overflowMenu = document.getElementById('topbar-overflow-menu');
  if (!overflowBtn || !overflowMenu) {
    return;
  }

  // Re-parent to <body>: the topbar's backdrop-filter makes it the
  // containing block for position:fixed, so the mobile bottom-sheet rules
  // would anchor to the topbar and push the menu above the viewport.
  document.body.appendChild(overflowMenu);

  // Toggle overflow menu
  overflowBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    const isOpen = overflowMenu.classList.toggle('open');
    overflowBtn.setAttribute('aria-expanded', isOpen);
  });

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (!overflowMenu.contains(e.target) && !overflowBtn.contains(e.target)) {
      overflowMenu.classList.remove('open');
      overflowBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Close on scroll
  document.querySelector('.content')?.addEventListener('scroll', function () {
    overflowMenu.classList.remove('open');
    overflowBtn.setAttribute('aria-expanded', 'false');
  });

  // Wire overflow menu buttons to their desktop counterparts
  document.getElementById('overflow-theme-toggle')?.addEventListener('click', function () {
    document.getElementById('theme-toggle')?.click();
    overflowMenu.classList.remove('open');
    overflowBtn.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('overflow-notif-btn')?.addEventListener('click', function () {
    document.getElementById('notif-btn')?.click();
    overflowMenu.classList.remove('open');
    overflowBtn.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('overflow-user-btn')?.addEventListener('click', function () {
    document.getElementById('user-menu-btn')?.click();
    overflowMenu.classList.remove('open');
    overflowBtn.setAttribute('aria-expanded', 'false');
  });

  // Sync overflow menu username/avatar with topbar
  function syncOverflowUser() {
    const topbarName = document.getElementById('topbar-username')?.textContent;
    // innerHTML (not textContent): the avatar may contain a profile <img>
    const topbarAvatar = document.getElementById('topbar-avatar')?.innerHTML;
    const overflowName = document.getElementById('overflow-username');
    const overflowAvatar = document.getElementById('overflow-avatar');
    if (overflowName && topbarName) {
      overflowName.textContent = topbarName;
    }
    if (overflowAvatar && topbarAvatar) {
      overflowAvatar.innerHTML = topbarAvatar;
    }
  }

  // Observe changes to topbar user info
  const topbarUsername = document.getElementById('topbar-username');
  if (topbarUsername) {
    new MutationObserver(syncOverflowUser).observe(topbarUsername, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Initial sync
  syncOverflowUser();
})();
