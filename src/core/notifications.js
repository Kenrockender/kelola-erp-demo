// Notification scheduler: overdue invoices + low stock + budget exceeded alerts
// Uses Notification API + SW postMessage for OS notifications.
// Exposes window.NSANotif for nav.js panel.

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
const ICON = '/icons/icon-192x192.png';

let _alerts = [];
let _unreadCount = 0;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function idr(v) {
  return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
}

function updateBadge() {
  const dot = document.querySelector('.notif-dot');
  if (!dot) {
    return;
  }
  if (_unreadCount > 0) {
    dot.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
    dot.style.display = 'flex';
  } else {
    dot.textContent = '';
    dot.style.display = 'none';
  }
}

async function sendOSNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
        tag,
        icon: ICON,
      });
    } else {
      new Notification(title, { body, tag, icon: ICON });
    }
  } catch (_) {
    /* ignore */
  }
}

export function getAlerts() {
  return _alerts;
}

export function getUnreadCount() {
  return _unreadCount;
}

export function markAllRead() {
  _unreadCount = 0;
  updateBadge();
}

export function checkAlerts() {
  const DB = window.DB;
  if (!DB) {
    return [];
  }

  const now = today();
  const next = [];

  // Group overdue SO into one summary alert
  const overdueSO = (DB.salesOrders || []).filter(o => {
    if (o.status === 'Paid' || o.status === 'Cancelled') {
      return false;
    }
    const due = o.dueDate || o.due;
    return due && due < now;
  });
  if (overdueSO.length > 0) {
    const total = overdueSO.reduce((s, o) => s + (o.owing || o.amount || 0), 0);
    next.push({
      id: 'overdue-so-summary',
      type: 'warning',
      // icon keys map to the SVG set in nav.js (_renderNotifPanel)
      icon: 'receivable',
      title: 'Piutang Jatuh Tempo',
      body: overdueSO.length + ' faktur · Total ' + idr(total),
      link: 'sales',
      ts: now,
      count: overdueSO.length,
    });
  }

  // Group overdue PO into one summary alert
  const overduePO = (DB.purchaseOrders || []).filter(o => {
    if (o.status === 'Received' || o.status === 'Paid' || o.status === 'Cancelled') {
      return false;
    }
    const due = o.dueDate || o.due;
    return due && due < now;
  });
  if (overduePO.length > 0) {
    const total = overduePO.reduce((s, o) => s + (o.amount || 0), 0);
    next.push({
      id: 'overdue-po-summary',
      type: 'danger',
      icon: 'payable',
      title: 'Hutang Jatuh Tempo',
      body: overduePO.length + ' PO · Total ' + idr(total),
      link: 'purchase',
      ts: now,
      count: overduePO.length,
    });
  }

  // ── Overdue Sales Invoices (Outstanding past source SO dueDate) ────────────
  const soMap = new Map((DB.salesOrders || []).map(o => [o.id, o]));
  const overdueSI = (DB.salesInvoices || []).filter(inv => {
    if (inv.status !== 'Outstanding') {
      return false;
    }
    const src = soMap.get(inv.sourceId);
    const due = inv.dueDate || (src && (src.dueDate || src.due));
    return due && due < now;
  });
  if (overdueSI.length > 0) {
    const total = overdueSI.reduce((s, i) => s + (i.amount || 0), 0);
    next.push({
      id: 'overdue-si-summary',
      type: 'danger',
      icon: 'receivable',
      title: 'Invoice Penjualan Jatuh Tempo',
      body: overdueSI.length + ' invoice · Total ' + idr(total),
      link: 'finance',
      ts: now,
      count: overdueSI.length,
    });
  }

  // ── Overdue Purchase Invoices ────────────────────────────────────────────────
  const poMap = new Map((DB.purchaseOrders || []).map(o => [o.id, o]));
  const overduePI = (DB.purchaseInvoices || []).filter(inv => {
    if (inv.status !== 'Outstanding') {
      return false;
    }
    const src = poMap.get(inv.sourceId);
    const due = inv.dueDate || (src && (src.dueDate || src.due));
    return due && due < now;
  });
  if (overduePI.length > 0) {
    const total = overduePI.reduce((s, i) => s + (i.amount || 0), 0);
    next.push({
      id: 'overdue-pi-summary',
      type: 'danger',
      icon: 'payable',
      title: 'Invoice Pembelian Jatuh Tempo',
      body: overduePI.length + ' invoice · Total ' + idr(total),
      link: 'finance',
      ts: now,
      count: overduePI.length,
    });
  }

  // ── Low stock (warehouse-aware) ──────────────────────────────────────────────
  (DB.inventoryItems || []).forEach(item => {
    if (!item.minStock || item.minStock <= 0) {
      return;
    }
    let currentStock = item.stock;
    if ((currentStock == null || currentStock === 0) && item.warehouseStock) {
      currentStock = Object.values(item.warehouseStock).reduce((s, v) => s + (Number(v) || 0), 0);
    }
    currentStock = currentStock || 0;
    if (currentStock <= item.minStock) {
      next.push({
        id: 'lowstock-' + item.id,
        type: 'info',
        icon: 'stock',
        title: 'Stok Rendah',
        body:
          (item.name || item.id) +
          ' — Stok: ' +
          currentStock +
          ' ' +
          (item.unit || '') +
          ' (min ' +
          item.minStock +
          ')',
        link: 'inventory',
        ts: now,
      });
    }
  });

  // ── Budget exceeded ──────────────────────────────────────────────────────────
  const budgets = DB.budgets || [];
  const journals = DB.journals || [];
  if (budgets.length > 0) {
    let exceededCount = 0;
    let exceededTotal = 0;
    budgets.forEach(b => {
      if (!b.amount || b.amount <= 0) {
        return;
      }
      let actual = 0;
      journals.forEach(j => {
        if (!j.date || j.date.substring(0, 7) !== b.period) {
          return;
        }
        (j.lines || []).forEach(l => {
          if ((l.accountNo || '') === b.accountCode) {
            actual += (Number(l.debit) || 0) - (Number(l.credit) || 0);
          }
        });
      });
      if (Math.abs(actual) > b.amount) {
        exceededCount++;
        exceededTotal += Math.abs(actual) - b.amount;
      }
    });
    if (exceededCount > 0) {
      next.push({
        id: 'budget-exceeded-summary',
        type: 'warning',
        icon: 'budget',
        title: 'Budget Terlampaui',
        body: exceededCount + ' akun melebihi anggaran · Lebih ' + idr(exceededTotal),
        link: 'finance',
        ts: now,
        count: exceededCount,
      });
    }
  }

  const prevIds = new Set(_alerts.map(a => a.id));
  const added = next.filter(a => !prevIds.has(a.id));
  _alerts = next;

  if (added.length > 0 || next.length !== _alerts.length) {
    _unreadCount = next.length;
    updateBadge();
    const parts = [];
    if (overdueSO.length) {
      parts.push(overdueSO.length + ' piutang jatuh tempo');
    }
    if (overduePO.length) {
      parts.push(overduePO.length + ' hutang jatuh tempo');
    }
    if (overdueSI.length) {
      parts.push(overdueSI.length + ' invoice penjualan jatuh tempo');
    }
    if (overduePI.length) {
      parts.push(overduePI.length + ' invoice pembelian jatuh tempo');
    }
    const lowCount = next.filter(a => a.icon === 'stock').length;
    if (lowCount) {
      parts.push(lowCount + ' item stok rendah');
    }
    const budgetAlert = next.find(a => a.id === 'budget-exceeded-summary');
    if (budgetAlert) {
      parts.push(budgetAlert.count + ' akun over-budget');
    }
    if (parts.length && added.length > 0) {
      sendOSNotification('Kelola ERP — Perhatian', parts.join(' · '), 'nsa-alert-' + now);
    }
  } else if (next.length === 0 && _unreadCount > 0) {
    _unreadCount = 0;
    updateBadge();
  }

  return _alerts;
}

export async function requestPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function initNotifications() {
  // First check after DB settles
  setTimeout(checkAlerts, 3000);
  setInterval(checkAlerts, CHECK_INTERVAL);

  window.NSANotif = { getAlerts, checkAlerts, getUnreadCount, markAllRead, requestPermission };
}
