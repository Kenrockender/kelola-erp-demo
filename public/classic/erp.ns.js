window.ERP = window.ERP || {};

ERP.state = ERP.state || {};
ERP.ui = ERP.ui || {};
ERP.registry = ERP.registry || {};
ERP.registry.renderers = ERP.registry.renderers || new Map();
ERP.registry.actions = ERP.registry.actions || new Map();

Object.defineProperties(ERP, {
  db: { get: () => DB, enumerable: true },
  activeView: { get: () => activeView, enumerable: true },
  filters: { get: () => filters, enumerable: true },
  charts: { get: () => charts, enumerable: true },
  navigate: { get: () => navigate, enumerable: true },
  saveDB: { get: () => saveDB, enumerable: true },
  loadDB: { get: () => loadDB, enumerable: true },
  showToast: { get: () => showToast, enumerable: true },
  openModal: { get: () => openModal, enumerable: true },
  closeModal: { get: () => closeModal, enumerable: true },
});

ERP.registerRenderer = function registerRenderer(id, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`ERP.registerRenderer: fn must be a function (got ${typeof fn})`);
  }
  ERP.registry.renderers.set(id, fn);
  if (typeof _renderedViews !== 'undefined') {
    _renderedViews.delete(id);
  }
  console.log(`[ERP] Renderer registered: "${id}"`);
};

ERP.registerAction = function registerAction(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`ERP.registerAction: fn must be a function (got ${typeof fn})`);
  }
  ERP.registry.actions.set(name, fn);
  console.log(`[ERP] Action registered: "${name}"`);
};

ERP.auditGlobals = function auditGlobals() {
  const browserKeys = new Set(Object.getOwnPropertyNames(window.__proto__));
  const ours = Object.getOwnPropertyNames(window)
    .filter(k => !browserKeys.has(k) && k !== 'ERP')
    .sort();
  console.group(`[ERP] ${ours.length} app-owned globals`);
  ours.forEach(k =>
    console.log(`  window.${k}`, typeof window[k] === 'function' ? '(fn)' : window[k])
  );
  console.groupEnd();
  return ours;
};

document.addEventListener(
  'click',
  function erpRegistryRouter(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      return;
    }
    const action = btn.dataset.action;
    if (!ERP.registry.actions.has(action)) {
      return;
    }
    const handler = ERP.registry.actions.get(action);
    const handled = handler(btn.dataset.id, btn.dataset.type, btn.dataset.val, e);
    if (handled === true) {
      e.stopImmediatePropagation();
    }
  },
  true
);
