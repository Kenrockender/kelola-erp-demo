const DB_SCHEMA_VERSION = 6;

function _migrateDB(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const from = data._version || 1;

  if (from < 2) {
    console.log('[ERP] Migrating schema v1 -> v2');

    if (!Array.isArray(data.notifications)) {
      data.notifications = [];
    }
    if (!Array.isArray(data.customers)) {
      data.customers = [];
    }
    if (!Array.isArray(data.suppliers)) {
      data.suppliers = [];
    }
    if (!Array.isArray(data.fleet)) {
      data.fleet = [];
    }
    if (!Array.isArray(data.expedition)) {
      data.expedition = [];
    }
    if (!data.accounts) {
      data.accounts = { cash: 0, bca: 0, mandiri: 0 };
    }
    if (!data.paymentLogs) {
      data.paymentLogs = [];
    }
    if (!data.reservations) {
      data.reservations = {};
    }

    (data.salesOrders || []).forEach(o => {
      if (!Array.isArray(o.lines)) {
        o.lines = [];
      }
      if (o.stockMutated === undefined) {
        o.stockMutated = o.status === 'Delivered';
      }
    });

    (data.purchaseOrders || []).forEach(o => {
      if (!Array.isArray(o.lines)) {
        o.lines = [];
      }
      if (o.stockMutated === undefined) {
        o.stockMutated = o.status === 'Received';
      }
    });

    (data.deliveryOrders || []).forEach(o => {
      if (o.soId === undefined) {
        o.soId = null;
      }
    });

    (data.inventoryItems || []).forEach(i => {
      i.stock = Number(i.stock) || 0;
      i.min = Number(i.min) || 0;
      i.cost = Number(i.cost) || 0;
      i.sell = Number(i.sell) || 0;
    });

    data._version = 2;
  }

  if (from < 3) {
    console.log('[ERP] Migrating schema v2 -> v3');

    if (!data.settings) {
      data.settings = {};
    }
    if (!data.settings.user) {
      data.settings.user = {
        name: 'Admin',
        initials: 'AD',
        role: 'Administrator',
        access: 'Full Access',
      };
    }
    if (!data.settings.company) {
      data.settings.company = {
        name: 'CV Contoh Sejahtera',
        address: 'Jl. Contoh No. 1, Jakarta, Indonesia',
        phone: '021-0000-0000',
      };
    }

    data._version = 3;
  }

  if (from < 4) {
    console.log('[ERP] Migrating schema v3 -> v4');

    // V4 document-flow engine: per-doc-type numbering registry
    // (PREFIX.YYYY.MM.NNNNN). Seeded empty; DocEngine.nextNumber() fills it
    // lazily. See docs/ARCHITECTURE_ERP_V4.md. db.js applyDefaults() also seeds
    // this on every load, so existing local data is covered even though this
    // migrate() runs only via ERP.schema.runNow().
    if (
      !data.numberSequences ||
      typeof data.numberSequences !== 'object' ||
      Array.isArray(data.numberSequences)
    ) {
      data.numberSequences = {};
    }

    data._version = 4;
  }

  if (from < 5) {
    console.log('[ERP] Migrating schema v4 -> v5');

    // V4 Phase 2: General Ledger. Seed empty containers; window.GL.ensureChart()
    // (via gl-sync's initial reconcile) fills accountsChart with the default CoA and
    // derives journals from existing SO/PO. db.js applyDefaults() also seeds these
    // on every load. See docs/ARCHITECTURE_ERP_V4.md §4.
    if (!Array.isArray(data.accountsChart)) {
      data.accountsChart = [];
    }
    if (!Array.isArray(data.journals)) {
      data.journals = [];
    }

    data._version = 5;
  }

  if (from < 6) {
    console.log('[ERP] Migrating schema v5 -> v6');

    // Phase 3b: Multi-warehouse stock. Seed warehouses array and warehouseStock
    // on each inventory item. Existing scalar stock migrates to the default WH.
    if (!Array.isArray(data.warehouses) || data.warehouses.length === 0) {
      data.warehouses = [
        { id: 'WH-DEFAULT', name: 'Gudang Utama', location: 'Default', active: true },
      ];
    }
    (data.inventoryItems || []).forEach(function (item) {
      if (!item.warehouseStock || typeof item.warehouseStock !== 'object') {
        item.warehouseStock = {};
        var total = Number(item.stock) || 0;
        if (total > 0) {
          item.warehouseStock['WH-DEFAULT'] = total;
        }
      }
    });
    if (!Array.isArray(data.itemTransfers)) {
      data.itemTransfers = [];
    }

    data._version = 6;
  }

  return data;
}

ERP.schema = {
  version: DB_SCHEMA_VERSION,
  migrate: _migrateDB,
  runNow: function runNow() {
    _migrateDB(DB);
    saveDB();
    navigate(activeView);
    showToast('Migrasi schema berhasil dijalankan', 'success');
  },
};
