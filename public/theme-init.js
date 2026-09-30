// Theme initialization — kept in an external file so the CSP script-src can
// stay 'self' (no 'unsafe-inline'). Deliberately render-blocking so the stored
// theme applies before first paint and there is no light/dark flash.
(function () {
  try {
    const theme = localStorage.getItem('erp_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (_e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
