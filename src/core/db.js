// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Database Module (Firestore, unused in the demo build)
// Replaces localStorage with Firestore for real-time sync when configured
// ═══════════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db as firestore, isFirebaseConfigured } from '../config/firebase.js';
import { kvGet, kvSet } from './local-store.js';

// Global DB object (in-memory cache).
// IMPORTANT: Vite's bundler hoists `DB` as a module-local variable, so
// `DB = ...` inside this module does NOT update the `window.DB` reference
// that classic <script> files read. We must call syncDBGlobal() after every
// reassignment to keep both in sync.
window.DB = {};
let DB = window.DB;
function syncDBGlobal() {
  window.DB = DB;
}

// Collection names synced with Firestore (load + realtime + save + migrate).
// NOTE: journals and accountsChart are intentionally NOT synced — gl-sync.js
// rebuilds them locally from the source documents on every load/save
// (GL.reconcileAll), so each device regenerates its own. auditLog is local-only
// by design. Everything else here is real user data that must sync.
const COLLECTIONS = {
  SALES_ORDERS: 'salesOrders',
  PURCHASE_ORDERS: 'purchaseOrders',
  INVENTORY_ITEMS: 'inventoryItems',
  DELIVERY_ORDERS: 'deliveryOrders',
  CUSTOMERS: 'customers',
  SUPPLIERS: 'suppliers',
  PAYMENT_LOGS: 'paymentLogs',
  NOTIFICATIONS: 'notifications',
  ACCOUNTS: 'accounts',
  RESERVATIONS: 'reservations',
  SETTINGS: 'settings',
  FLEET: 'fleet',
  EXPEDITION: 'expedition',
  // Document-flow collections (added 2026-06-06 so all modules sync, not just core)
  SALES_INVOICES: 'salesInvoices',
  PURCHASE_INVOICES: 'purchaseInvoices',
  SALES_RECEIPTS: 'salesReceipts',
  PURCHASE_PAYMENTS: 'purchasePayments',
  SALES_QUOTATIONS: 'salesQuotations',
  PURCHASE_QUOTATIONS: 'purchaseQuotations',
  SALES_RETURNS: 'salesReturns',
  PURCHASE_RETURNS: 'purchaseReturns',
  ITEM_ADJUSTMENTS: 'itemAdjustments',
  ITEM_TRANSFERS: 'itemTransfers',
  WAREHOUSES: 'warehouses',
  // Penerimaan Barang (sales-purchase-extras.js). Was missing here, so user-
  // created receipts never synced to Firestore and were lost on device switch or
  // storage clear; also feeds the (dormant) PO-side status derivation the same
  // way deliveryOrders feed SOs.
  GOODS_RECEIPTS: 'goodsReceipts',
  // Master data: employees (payroll module + department-driven RBAC role
  // assignment). Added so employee records sync across devices.
  EMPLOYEES: 'employees',
  NUMBER_SEQUENCES: 'numberSequences',
  AUDIT_LOG: 'auditLog',
  // Recycle bin (trash.js): deleted records held for one-click restore.
  TRASH: 'trash',
};

// Collections stored as a single object document ('default'), not an array.
const OBJECT_COLLECTIONS = new Set(['accounts', 'reservations', 'settings', 'numberSequences']);
function isObjectCollection(name) {
  return OBJECT_COLLECTIONS.has(name);
}

// Real-time listeners
const listeners = new Map();

// Local-first persistence: when Firestore is unavailable, the whole DB is
// mirrored to IndexedDB (store 'kv' of database 'nsa-local') so data survives a
// page refresh. localStorage is only used as a legacy/migration source and as
// the handoff channel from import.html — it caps at ~5–10MB and the dataset
// already exceeds that comfort zone.
const LOCAL_KEY = 'erp_db_v1';
// Remember a Firestore outage so we don't re-probe (and block boot) on every
// refresh. Retry at most once per interval.
const FS_FAIL_KEY = 'erp_fs_unavailable_until';
const FS_RETRY_INTERVAL = 30 * 60 * 1000; // 30 minutes
let usingLocalStore = false;

/**
 * Read the locally persisted DB. Priority:
 *   1. localStorage erp_db_v1 — legacy data or a fresh import.html handoff.
 *      Migrated into IndexedDB and removed (frees the localStorage quota).
 *   2. IndexedDB 'nsa-local'/kv/erp_db_v1 — the normal storage backend.
 * Returns the parsed object or null.
 */
async function readLocalSaved() {
  // localStorage first: import.html writes here, and pre-IndexedDB installs
  // still have their data here. Either way it wins, then moves to IndexedDB.
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      try {
        await kvSet(LOCAL_KEY, parsed);
        localStorage.removeItem(LOCAL_KEY);
        console.warn('[DB] Migrated local data localStorage → IndexedDB');
      } catch (e) {
        console.warn('[DB] IndexedDB migration failed, keeping localStorage copy:', e);
      }
      return parsed;
    }
  } catch (_) {
    /* localStorage unavailable or corrupt — fall through to IndexedDB */
  }

  try {
    const saved = await kvGet(LOCAL_KEY);
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch (e) {
    console.warn('[DB] IndexedDB read failed:', e);
  }
  return null;
}

/** Load the DB from IndexedDB/localStorage, or seed defaults on first run. */
async function loadLocal(reason) {
  let saved;
  try {
    saved = await readLocalSaved();
  } catch (_) {
    saved = null;
  }

  // Drop an empty saved copy so we fall through to the (empty) defaults seed.
  if (
    saved &&
    !(
      (saved.salesOrders || []).length > 0 ||
      (saved.inventoryItems || []).length > 0 ||
      (saved.customers || []).length > 0
    )
  ) {
    saved = null;
  }

  if (saved) {
    DB = normalizeImportedDB(saved);
    console.warn(`[DB] Loaded local data from IndexedDB (${reason})`);
  } else {
    // No real local data yet. Business data + the GL seed live in Firestore
    // now (loadGlSeed); local mode only has whatever a prior Firestore load
    // persisted. Seed the empty in-file defaults so the app boots cleanly.
    DB = normalizeImportedDB(defaultData);
    console.warn(`[DB] No local data yet — seeded empty defaults (${reason})`);
  }

  applyDefaults();
  usingLocalStore = true;
  try {
    window.__nsaDataMode = 'local';
  } catch (_) {
    /* ignore */
  }
  persistLocal();
}

// Serialized fire-and-forget IndexedDB writes: at most one put in flight, and a
// burst of saves coalesces into a single trailing write of the latest state.
let _persistInFlight = false;
let _persistQueued = false;

/** Persist the entire in-memory DB to IndexedDB (async, coalesced). */
function persistLocal() {
  if (_persistInFlight) {
    _persistQueued = true;
    return true;
  }
  _persistInFlight = true;
  // The write captures whatever DB holds at put() time — with coalescing that
  // is always the latest state, which is exactly what we want persisted.
  kvSet(LOCAL_KEY, DB)
    .catch(err => {
      // DataCloneError (non-cloneable value snuck into DB) → JSON round-trip
      // strips it; other errors are surfaced.
      if (err && err.name === 'DataCloneError') {
        return kvSet(LOCAL_KEY, JSON.parse(JSON.stringify(DB)));
      }
      throw err;
    })
    .catch(err => {
      console.error('[DB] Failed to persist to IndexedDB:', err);
      try {
        showToast('Gagal menyimpan data lokal', 'danger');
      } catch (_) {
        /* ignore */
      }
    })
    .finally(() => {
      _persistInFlight = false;
      if (_persistQueued) {
        _persistQueued = false;
        persistLocal();
      }
    });
  return true;
}

/** Whether demo seeding is enabled (default on; set VITE_SEED_DEMO=false to disable). */
function _demoSeedEnabled() {
  try {
    return import.meta.env.VITE_SEED_DEMO !== 'false';
  } catch (_) {
    return true;
  }
}

/**
 * Seed the generic dummy dataset into an empty (first-run) Firestore database and
 * persist it, so a fresh cloud deploy starts populated just like local mode.
 * No-op when the DB already has data or seeding is disabled.
 */
async function seedDemoIfEmpty() {
  if (!_demoSeedEnabled()) {
    return false;
  }
  const empty = !(
    (DB.customers || []).length ||
    (DB.inventoryItems || []).length ||
    (DB.salesOrders || []).length
  );
  if (!empty) {
    return false;
  }
  const clone = v => JSON.parse(JSON.stringify(v));
  Object.keys(defaultData).forEach(key => {
    if (Array.isArray(defaultData[key]) && !(DB[key] && DB[key].length)) {
      DB[key] = clone(defaultData[key]);
    }
  });
  syncDBGlobal();
  try {
    // Persist the freshly seeded collections to Firestore (dirty vs the empty
    // baseline just taken), so the data survives reloads on the deployed site.
    await saveDB();
    console.warn('[DB] Seeded demo dataset into empty Firestore database');
  } catch (e) {
    console.warn('[DB] Demo seed persist failed (kept in memory):', e);
  }
  return true;
}

/**
 * Initialize database - Load all collections from Firestore
 */
export async function loadDB() {
  // Without credentials, Firestore calls retry for ~30s before failing and
  // block boot. Use local persistence instead.
  if (!isFirebaseConfigured) {
    await loadLocal('Firebase not configured');
    return false;
  }

  // If Firestore was recently found unavailable, skip the (slow) probe so
  // refreshes are instant. We retry at most once per FS_RETRY_INTERVAL.
  let failUntil = 0;
  try {
    failUntil = parseInt(localStorage.getItem(FS_FAIL_KEY) || '0', 10) || 0;
  } catch (_) {
    /* ignore */
  }
  if (Date.now() < failUntil) {
    await loadLocal('Firestore recently unavailable');
    return false;
  }

  try {
    // eslint-disable-next-line no-console
    console.log('[DB] Loading data from Firestore...');

    // Load all collections in parallel
    const promises = Object.entries(COLLECTIONS).map(async ([_key, collectionName]) => {
      try {
        const snapshot = await getDocs(collection(firestore, collectionName));
        const data = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });
        // Key the in-memory cache by the camelCase collection name (e.g.
        // "salesOrders"), which is what the rest of the app reads from DB.
        return [collectionName, data];
      } catch (err) {
        // A role that is denied ONE collection (the field `lapangan` role may
        // read only what it needs) must not drop the whole app into offline
        // mode — that is what a rejected promise here used to do, because the
        // batch was awaited with Promise.all. Treat a denied collection as
        // empty and carry on; any other error still surfaces in the console.
        if (err && err.code === 'permission-denied') {
          return [collectionName, []];
        }
        throw err;
      }
    });

    // If Firestore is unreachable (e.g. the database isn't provisioned) the SDK
    // retries for ~30s and would block boot. Cap the wait and fall back.
    // 15s (was 4s): now loads 25 collections in parallel, and a first cold
    // connect to a regional DB (e.g. asia-southeast2) over the auth handshake can
    // legitimately take >4s. The outage is cached for 30 min so this longer wait
    // is only paid once when Firestore is genuinely down.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Firestore load timed out')), 15000)
    );
    const results = await Promise.race([Promise.all(promises), timeout]);

    // Populate DB object
    results.forEach(([key, data]) => {
      if (isObjectCollection(key)) {
        // These are objects, not arrays
        DB[key] = data.length > 0 ? data[0] : getDefaultValue(key);
      } else {
        DB[key] = data;
      }
    });

    // Load the GL seed (Accurate journals + chart of accounts) from the
    // auth-gated glSeed collection. This is the sole source for that data now
    // (it replaced the public accurate-data.json).
    await loadGlSeed();

    // Apply defaults for missing data
    applyDefaults();

    // Everything in memory now matches Firestore — baseline the dirty tracker
    // so the first saveDB() only writes records changed after this point.
    rebaselineSaved();

    // First-run demo seed: if the cloud database is empty, populate it with the
    // generic dummy dataset (and persist to Firestore) so every screen — and the
    // "Kesiapan Data Perusahaan" checklist — is filled on a fresh deploy too, not
    // just in local mode. Disable by setting VITE_SEED_DEMO=false.
    await seedDemoIfEmpty();

    // Set up real-time listeners
    setupRealtimeListeners();

    // eslint-disable-next-line no-console
    console.log('✓ Data loaded from Firestore');
    usingLocalStore = false;
    try {
      window.__nsaDataMode = 'firestore';
    } catch (_) {
      /* ignore */
    }
    try {
      localStorage.removeItem(FS_FAIL_KEY);
    } catch (_) {
      /* ignore */
    }
    return true;
  } catch (error) {
    console.warn('[DB] Firestore unavailable, using local storage:', error.message);
    try {
      localStorage.setItem(FS_FAIL_KEY, String(Date.now() + FS_RETRY_INTERVAL));
    } catch (_) {
      /* ignore */
    }

    // Fall back to local persistence (IndexedDB), seeded from defaults.
    await loadLocal('Firestore unavailable');
    try {
      showToast('Mode offline — data disimpan di perangkat ini', 'warning');
    } catch (_) {
      /* ignore */
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dirty-collection tracking. Almost every call site invokes saveDB() with no
// arguments after touching a single record, so a naive full-DB save rewrites
// thousands of unchanged documents per CRUD action — enough to blow the
// Firestore free-tier daily write quota ("resource-exhausted"). Instead we keep
// a per-collection snapshot of what Firestore last saw and only write the
// records whose serialized form actually differs (plus deletes for records
// that vanished).
// ─────────────────────────────────────────────────────────────────────────────

// collectionName → Map(id → JSON of record) for array collections,
// or the JSON string of the whole document for object collections.
const _savedSnapshot = new Map();

function snapshotOf(name, data) {
  if (isObjectCollection(name) || !Array.isArray(data)) {
    return JSON.stringify(data == null ? null : data);
  }
  const map = new Map();
  data.forEach(item => {
    if (item && item.id != null) {
      map.set(String(item.id), JSON.stringify(item));
    }
  });
  return map;
}

function markCollectionSaved(name, data) {
  _savedSnapshot.set(name, snapshotOf(name, data));
}

/** Re-baseline every synced collection as "already saved" (e.g. after load). */
export function rebaselineSaved() {
  for (const name of Object.values(COLLECTIONS)) {
    markCollectionSaved(name, DB[name]);
  }
}

/**
 * Compute what changed in a collection since the last successful save.
 * Returns null when nothing changed (or the collection is absent from DB).
 */
function diffCollection(name) {
  const data = DB[name];
  if (data == null) {
    return null;
  }

  if (isObjectCollection(name) || !Array.isArray(data)) {
    const json = JSON.stringify(data);
    if (_savedSnapshot.get(name) === json) {
      return null;
    }
    return { kind: 'object', data, snapshot: json };
  }

  const prev = _savedSnapshot.get(name);
  const prevMap = prev instanceof Map ? prev : new Map();
  const nextMap = new Map();
  const sets = [];
  for (const item of data) {
    if (!item || item.id == null) {
      continue;
    }
    const id = String(item.id);
    const json = JSON.stringify(item);
    nextMap.set(id, json);
    if (prevMap.get(id) !== json) {
      sets.push(item);
    }
  }
  const deletes = [];
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      deletes.push(id);
    }
  }
  if (sets.length === 0 && deletes.length === 0) {
    return null;
  }
  return { kind: 'array', sets, deletes, snapshot: nextMap };
}

/** Recursively remove undefined values so Firestore WriteBatch.set() doesn't reject them. */
function stripUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined);
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (obj[k] !== undefined) {
        out[k] = stripUndefined(obj[k]);
      }
    }
    return out;
  }
  return obj;
}

// Identity stamped onto every write so a record carries who last touched it
// (audit + concurrent-edit forensics). Read from the auth session written by
// auth.js (SESSION_KEY 'erp_session') to avoid an import cycle with auth.js.
function currentUserName() {
  try {
    const raw = sessionStorage.getItem('erp_session');
    if (!raw) {
      return null;
    }
    const s = JSON.parse(raw);
    return (s && s.username) || null;
  } catch (_) {
    return null;
  }
}

/** Write only the dirty records of dirty collections, in ≤450-op batches. */
async function flushDirtyCollections() {
  const dirty = [];
  for (const name of Object.values(COLLECTIONS)) {
    const diff = diffCollection(name);
    if (diff) {
      dirty.push([name, diff]);
    }
  }
  if (dirty.length === 0) {
    return;
  }

  let batch = writeBatch(firestore);
  let ops = 0;
  let total = 0;
  const addOp = async () => {
    ops++;
    total++;
    // Firestore batch limit is 500 operations — commit and start a fresh batch
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(firestore);
      ops = 0;
    }
  };

  const updatedBy = currentUserName();
  for (const [name, diff] of dirty) {
    if (diff.kind === 'object') {
      batch.set(
        doc(firestore, name, 'default'),
        stripUndefined({
          ...diff.data,
          updatedAt: serverTimestamp(),
          ...(updatedBy ? { updatedBy } : {}),
        }),
        { merge: true }
      );
      await addOp();
      continue;
    }
    for (const item of diff.sets) {
      batch.set(
        doc(firestore, name, String(item.id)),
        stripUndefined({
          ...item,
          updatedAt: serverTimestamp(),
          ...(updatedBy ? { updatedBy } : {}),
        }),
        { merge: true }
      );
      await addOp();
    }
    for (const id of diff.deletes) {
      batch.delete(doc(firestore, name, id));
      await addOp();
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  // Baseline only after every batch committed; a partial failure simply
  // rewrites the affected records on the next flush (sets are merge-idempotent).
  for (const [name, diff] of dirty) {
    _savedSnapshot.set(name, diff.snapshot);
  }
  // eslint-disable-next-line no-console
  console.log(`✓ Data saved to Firestore (${total} operations, ${dirty.length} collections)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GL seed (auth-gated). journals (the Accurate-sourced JVs needed for P&L) and
// accountsChart are NOT in the synced COLLECTIONS and used to come from the
// public accurate-data.json — a confidentiality leak. They now live in the
// admin-writable, signed-in-readable `glSeed` Firestore collection:
//   glSeed/meta          { version, migratedAt, journalChunks, journalCount }
//   glSeed/accountsChart { items: [...] }
//   glSeed/journals_NNN  { items: [...] }   (journals chunked < 1 MB/doc)
// loadGlSeed() populates DB.journals / DB.accountsChart from there.
// ─────────────────────────────────────────────────────────────────────────────
const GL_SEED = 'glSeed';

async function loadGlSeed() {
  try {
    const snap = await getDocs(collection(firestore, GL_SEED));
    if (snap.empty) {
      return false; // glSeed empty (offline/first cold start) — journals come from the local snapshot
    }
    let accountsChart = null;
    const chunks = [];
    snap.forEach(d => {
      if (d.id === 'accountsChart') {
        accountsChart = d.data().items;
      } else if (d.id.startsWith('journals_')) {
        chunks.push([d.id, d.data().items || []]);
      }
    });
    chunks.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const journals = chunks.flatMap(c => c[1]);
    if (journals.length > 0) {
      DB.journals = journals;
    }
    if (Array.isArray(accountsChart) && accountsChart.length > 0) {
      DB.accountsChart = accountsChart;
    }
    syncDBGlobal();
    // eslint-disable-next-line no-console
    console.log(
      `[DB] GL seed loaded from Firestore: ${journals.length} journals, ${(accountsChart || []).length} accounts`
    );
    return true;
  } catch (e) {
    console.warn('[DB] loadGlSeed failed:', e.message);
    return false;
  }
}

// NOTE: the one-time glSeed migration helper (window.__migrateGlToFirestore) and
// the deployed-JSON reseed machinery (maybeReseedFirestore + mergeDeployedData)
// were removed when the public accurate-data.json was deleted. Updating the GL
// seed in future re-scrapes is now an admin task that writes the glSeed docs
// directly (see scripts/ + docs); there is no public JSON to merge from anymore.

// Debounced, serialized flushing: a burst of saveDB() calls (e.g. a CRUD action
// that touches several collections) coalesces into one diff+commit, and at most
// one flush is in flight at a time. All callers in a burst share one promise.
const SAVE_DEBOUNCE_MS = 250;
let _saveTimer = null;
let _savePromise = null;
let _saveResolve = null;
let _saveReject = null;
let _saveInFlight = false;
let _saveRerun = false;

function scheduleSave() {
  if (!_savePromise) {
    _savePromise = new Promise((resolve, reject) => {
      _saveResolve = resolve;
      _saveReject = reject;
    });
  }
  if (_saveTimer) {
    clearTimeout(_saveTimer);
  }
  _saveTimer = setTimeout(runScheduledSave, SAVE_DEBOUNCE_MS);
  return _savePromise;
}

function runScheduledSave() {
  _saveTimer = null;
  if (_saveInFlight) {
    _saveRerun = true;
    return;
  }
  const resolve = _saveResolve || (() => {});
  const reject = _saveReject || (() => {});
  _savePromise = null;
  _saveResolve = null;
  _saveReject = null;
  _saveInFlight = true;
  flushDirtyCollections()
    .then(() => resolve())
    .catch(error => {
      reportSaveError(error);
      reject(error);
    })
    .finally(() => {
      _saveInFlight = false;
      if (_saveRerun) {
        _saveRerun = false;
        runScheduledSave();
      }
    });
}

/** Flush any pending debounced save immediately (e.g. on page unload). */
export function flushPendingSaves() {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  if (!_savePromise && !_saveInFlight) {
    return Promise.resolve();
  }
  const pending = _savePromise || Promise.resolve();
  runScheduledSave();
  return pending;
}

function reportSaveError(error) {
  console.error('Failed to save data to Firestore:', error);
  // permission-denied almost always means the signed-in user hasn't verified
  // their email yet (Firestore rules require email_verified for writes).
  // Surface an actionable message instead of a generic failure.
  try {
    if (error && error.code === 'permission-denied') {
      showToast(
        'Gagal menyimpan: email belum diverifikasi. Cek banner verifikasi di atas.',
        'danger'
      );
    } else {
      showToast('Gagal menyimpan data ke server', 'danger');
    }
  } catch (_) {
    /* toast unavailable (early boot) */
  }
}

/**
 * Save data to Firestore
 * @param {string} collectionName - Collection to save
 * @param {object|array} data - Data to save
 */
export async function saveDB(collectionName = null, data = null) {
  // Local-first mode: mirror the whole DB to IndexedDB and stop here.
  if (usingLocalStore) {
    persistLocal();
    return;
  }

  // If specific collection provided, save only that (immediately).
  if (collectionName && data) {
    try {
      await saveCollection(collectionName, data);
      markCollectionSaved(collectionName, data);
      // eslint-disable-next-line no-console
      console.log(`✓ ${collectionName} saved to Firestore`);
    } catch (error) {
      reportSaveError(error);
      throw error;
    }
    return;
  }

  // Otherwise diff the whole DB against the last-saved snapshot and write only
  // what changed (debounced so rapid CRUD bursts coalesce into one commit).
  return scheduleSave();
}

/**
 * Save a single collection
 */
async function saveCollection(collectionName, data) {
  const updatedBy = currentUserName();
  if (Array.isArray(data)) {
    // Save array items in chunks — a Firestore writeBatch caps at 500 ops.
    for (let i = 0; i < data.length; i += 450) {
      const batch = writeBatch(firestore);
      data.slice(i, i + 450).forEach(item => {
        const docRef = doc(firestore, collectionName, String(item.id));
        batch.set(
          docRef,
          {
            ...item,
            updatedAt: serverTimestamp(),
            ...(updatedBy ? { updatedBy } : {}),
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  } else {
    // Save single object
    const docRef = doc(firestore, collectionName, 'default');
    await setDoc(
      docRef,
      {
        ...data,
        updatedAt: serverTimestamp(),
        ...(updatedBy ? { updatedBy } : {}),
      },
      { merge: true }
    );
  }
}

/**
 * Fold a remote snapshot into an array collection without clobbering unsaved
 * local edits. Remote docs win everywhere EXCEPT ids with pending (un-flushed)
 * local changes, which stay local — the debounced saveDB flush writes them out
 * moments later (local-wins last-write semantics, but no longer silent).
 * The dirty baseline is set to the REMOTE state so those pending edits remain
 * dirty and actually flush. Returns the number of true conflicts (docs changed
 * both locally and remotely since the last sync).
 */
function mergeRemoteSnapshot(name, remoteData) {
  const localDiff = diffCollection(name);
  if (!localDiff || localDiff.kind !== 'array') {
    DB[name] = remoteData;
    markCollectionSaved(name, remoteData);
    return 0;
  }

  const prev = _savedSnapshot.get(name);
  const baseline = prev instanceof Map ? prev : new Map();
  const pendingEdits = new Map(localDiff.sets.map(item => [String(item.id), item]));
  const pendingDeletes = new Set(localDiff.deletes);
  const remoteIds = new Set();
  let conflicts = 0;
  const merged = [];

  for (const rec of remoteData) {
    const id = String(rec.id);
    remoteIds.add(id);
    if (pendingDeletes.has(id)) {
      continue; // deleted locally — the flush will delete it remotely too
    }
    const local = pendingEdits.get(id);
    if (local) {
      // Changed remotely as well (differs from what this device last synced)?
      const base = baseline.get(id);
      if (base === undefined || base !== JSON.stringify(rec)) {
        conflicts++;
      }
      merged.push(local);
    } else {
      merged.push(rec);
    }
  }
  // Pending local docs the server doesn't have (created here, or deleted
  // remotely while being edited here) stay — the flush re-creates them.
  for (const [id, local] of pendingEdits) {
    if (!remoteIds.has(id)) {
      merged.push(local);
    }
  }

  DB[name] = merged;
  markCollectionSaved(name, remoteData);
  return conflicts;
}

// Test hook: exercised directly in tests (the onSnapshot plumbing is mocked away).
export { mergeRemoteSnapshot as _mergeRemoteSnapshot };

let _conflictToastAt = 0;
function notifyEditConflict(name, count) {
  // At most one warning per 10s — the flush right after resolves the state.
  const now = Date.now();
  if (now - _conflictToastAt < 10_000) {
    return;
  }
  _conflictToastAt = now;
  try {
    showToast(
      `Konflik edit di ${name} (${count} dokumen): perangkat lain menyimpan versi berbeda — perubahan Anda dipertahankan.`,
      'warning'
    );
  } catch (_) {
    /* ignore */
  }
  console.warn(`[DB] concurrent edit on ${name}: ${count} doc(s) changed locally AND remotely`);
}

/**
 * Set up real-time listeners for all collections
 */
// Coalesce the burst of per-collection snapshots into a single active-view
// re-render. Also records the last sync time for the status indicator.
let _remoteRefreshScheduled = false;
function scheduleRemoteRefresh() {
  try {
    window.__nsaLastSync = Date.now();
  } catch (_) {
    /* ignore */
  }
  if (_remoteRefreshScheduled) {
    return;
  }
  _remoteRefreshScheduled = true;
  const run = () => {
    _remoteRefreshScheduled = false;
    try {
      if (typeof navigate === 'function' && typeof activeView !== 'undefined' && activeView) {
        if (typeof _renderedViews !== 'undefined') {
          try {
            _renderedViews.delete(activeView);
          } catch (_) {
            /* ignore */
          }
        }
        navigate(activeView);
      }
    } catch (e) {
      console.warn('[DB] remote refresh failed:', e);
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

function setupRealtimeListeners() {
  Object.entries(COLLECTIONS).forEach(([, collectionName]) => {
    const dataKey = collectionName;

    // Skip if listener already exists
    if (listeners.has(collectionName)) {
      return;
    }

    const unsubscribe = onSnapshot(
      collection(firestore, collectionName),
      snapshot => {
        const data = [];
        snapshot.forEach(doc => {
          data.push({ id: doc.id, ...doc.data() });
        });

        // Update in-memory cache. Object collections replace outright; array
        // collections merge so an incoming snapshot can't silently clobber local
        // edits that haven't flushed yet — conflicts are surfaced, not dropped.
        if (isObjectCollection(dataKey)) {
          DB[dataKey] = data.length > 0 ? data[0] : getDefaultValue(dataKey);
          // This collection now mirrors the server — re-baseline the dirty
          // tracker so the next saveDB() doesn't rewrite synced records.
          markCollectionSaved(dataKey, DB[dataKey]);
        } else {
          const conflicts = mergeRemoteSnapshot(dataKey, data);
          if (conflicts > 0) {
            notifyEditConflict(dataKey, conflicts);
          }
        }
        // SO/PO status is owned by the sync script (Accurate authority); do not
        // re-derive from DO linkage here (see applyDefaults note + _deriveOrderStatuses).
        syncDBGlobal();

        // A remote snapshot just replaced a local collection. Re-baseline the
        // data-integrity snapshot (integrity.js) so the next local save diffs
        // against the synced state — otherwise audit/period-lock would misfire
        // on records that arrived via sync, not via this device.
        if (window.Integrity && typeof window.Integrity.refreshSnapshot === 'function') {
          window.Integrity.refreshSnapshot();
        }
        // Same for the recycle bin (trash.js): records removed by a remote sync
        // were already binned on the deleting device — don't re-capture them.
        if (window.Trash && typeof window.Trash.refreshSnapshot === 'function') {
          window.Trash.refreshSnapshot();
        }
        // Same for the RBAC safety net (rbac.js): a remote-synced change is not a
        // local edit, so re-baseline before the next save diffs against it.
        if (window.RBAC && typeof window.RBAC.refreshSnapshot === 'function') {
          window.RBAC.refreshSnapshot();
        }

        // Re-render the active view on any relevant remote change. Most views
        // aggregate several collections, so refresh broadly (coalesced to one
        // render per animation frame to absorb the initial multi-collection burst).
        scheduleRemoteRefresh();
      },
      error => {
        console.error(`Listener error for ${collectionName}:`, error);
      }
    );

    listeners.set(collectionName, unsubscribe);
  });

  // eslint-disable-next-line no-console
  console.log('✓ Real-time listeners active');
}

/**
 * Clean up listeners
 */
export function cleanupListeners() {
  listeners.forEach(unsubscribe => unsubscribe());
  listeners.clear();
  // eslint-disable-next-line no-console
  console.log('✓ Listeners cleaned up');
}

/**
 * One-time migration: push the current LOCAL data (localStorage / in-memory DB)
 * up to Firestore so existing records appear in the cloud and start syncing.
 * Requires Firebase Auth (request.auth) — the security rules reject anonymous
 * writes. Derived collections (journals, accountsChart) are skipped; each device
 * regenerates them via GL.reconcileAll. Calls onProgress({collection, written}).
 * Returns the number of documents written.
 */
export async function migrateLocalToFirestore(onProgress) {
  if (!isFirebaseConfigured || !firestore) {
    throw new Error('Firebase belum dikonfigurasi (cek .env).');
  }

  // Source priority:
  // 1. IndexedDB/localStorage erp_db_v1 (normal first-time migration)
  // 2. In-memory DB             (last resort)
  let source = DB;
  try {
    const saved = await readLocalSaved();
    if (saved) {
      source = saved;
      // eslint-disable-next-line no-console
      console.log('[Migrate] Source: local store');
    } else {
      // eslint-disable-next-line no-console
      console.log('[Migrate] Source: in-memory DB');
    }
  } catch (_) {
    source = DB;
  }

  let written = 0;
  const report = (name, phase) => {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ collection: name, written, phase: phase || 'writing' });
      } catch (_) {
        /* ignore */
      }
    }
  };

  for (const collectionName of Object.values(COLLECTIONS)) {
    // ── Phase 1: wipe existing docs so a re-scrape doesn't leave stale IDs ──
    report(collectionName, 'clearing');
    try {
      const existingSnap = await getDocs(collection(firestore, collectionName));
      if (!existingSnap.empty) {
        const refs = [];
        existingSnap.forEach(d => refs.push(d.ref));
        for (let i = 0; i < refs.length; i += 450) {
          const delBatch = writeBatch(firestore);
          refs.slice(i, i + 450).forEach(ref => delBatch.delete(ref));
          await delBatch.commit();
        }
      }
    } catch (e) {
      console.warn('[Migrate] Could not clear', collectionName, ':', e.message);
    }

    // ── Phase 2: write new data ───────────────────────────────────────────────
    const data = source[collectionName];
    if (data == null) {
      continue;
    }

    // Object collections → single 'default' document.
    if (isObjectCollection(collectionName)) {
      if (typeof data !== 'object' || Array.isArray(data)) {
        continue;
      }
      await setDoc(
        doc(firestore, collectionName, 'default'),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true }
      );
      written++;
      report(collectionName, 'writing');
      continue;
    }

    // Array collections → one doc per item, batched (Firestore limit 500/batch).
    if (!Array.isArray(data) || data.length === 0) {
      continue;
    }
    let batch = writeBatch(firestore);
    let ops = 0;
    for (const item of data) {
      if (!item || item.id == null) {
        continue;
      }
      batch.set(
        doc(firestore, collectionName, String(item.id)),
        { ...item, updatedAt: serverTimestamp() },
        { merge: true }
      );
      ops++;
      written++;
      if (ops >= 450) {
        await batch.commit();
        report(collectionName, 'writing');
        batch = writeBatch(firestore);
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
      report(collectionName, 'writing');
    }
  }

  // Record which dataset version Firestore now holds (informational; the old
  // deployed-JSON reseed check that read this was removed with accurate-data.json).
  try {
    await setDoc(doc(firestore, 'meta', 'dataset'), {
      version: Number(source._version) || 0,
      migratedAt: source._migratedAt || '',
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[Migrate] Could not record meta/dataset:', e.message);
  }

  // Make the next load use Firestore instead of the cached "unavailable" path.
  try {
    localStorage.removeItem(FS_FAIL_KEY);
  } catch (_) {
    /* ignore */
  }
  return written;
}

/**
 * Get default value for a collection
 */
function getDefaultValue(key) {
  const defaults = {
    accounts: { cash: 0, bca: 0, mandiri: 0 },
    reservations: {},
    settings: {
      user: {
        name: 'Admin',
        initials: 'AD',
        role: 'Administrator',
        access: 'Full Access',
      },
      company: {
        name: 'CV Contoh Sejahtera',
        address: 'Jl. Contoh No. 1, Jakarta, Indonesia',
        phone: '021-0000-0000',
      },
      tax: {
        pkp: true,
        npwp: '',
        ppnRate: 0.11,
        pphRate: 0,
        rounding: 'round',
      },
      users: [],
      itemCategories: ['Umum', 'ATK', 'Elektronik', 'Bahan Baku'],
      units: ['pcs', 'box', 'unit', 'rim', 'roll', 'kg'],
      assetCategories: ['Bangunan', 'Kendaraan', 'Peralatan'],
      assetFiscalCategories: ['Golongan 1', 'Golongan 2', 'Golongan 3'],
      assets: [],
      assetTransfers: [],
      assetDisposals: [],
    },
  };
  return defaults[key] || {};
}

/**
 * Apply default values for missing data
 */
function applyDefaults() {
  // Keys must match the camelCase collection names used throughout the app.
  if (!DB.salesOrders) {
    DB.salesOrders = [];
  }
  if (!DB.purchaseOrders) {
    DB.purchaseOrders = [];
  }
  if (!DB.inventoryItems) {
    DB.inventoryItems = [];
  }
  if (!DB.deliveryOrders) {
    DB.deliveryOrders = [];
  }
  if (!DB.customers) {
    DB.customers = [];
  }
  if (!DB.suppliers) {
    DB.suppliers = [];
  }
  if (!DB.paymentLogs) {
    DB.paymentLogs = [];
  }
  if (!DB.notifications) {
    DB.notifications = [];
  }
  if (!DB.fleet) {
    DB.fleet = [];
  }
  if (!DB.expedition) {
    DB.expedition = [];
  }
  if (!DB.accounts) {
    DB.accounts = getDefaultValue('accounts');
  }
  if (!DB.reservations) {
    DB.reservations = getDefaultValue('reservations');
  }
  // Dashboard chart seed arrays. Seeded in normalizeImportedDB on the local path,
  // but the Firestore path skips that — seed here so the dashboard's empty-state
  // charts (revenueData.find, etc.) don't crash when Firestore has no data yet.
  if (!Array.isArray(DB.revenueData)) {
    DB.revenueData = [];
  }
  if (!Array.isArray(DB.topProducts)) {
    DB.topProducts = [];
  }
  if (!Array.isArray(DB.accountsTrend)) {
    DB.accountsTrend = [];
  }
  // V4: per-doc-type numbering registry (PREFIX.YYYY.MM.NNNNN). Seeded empty;
  // DocEngine.nextNumber() populates it lazily. Additive — nothing reads it yet
  // except the opt-in engine. See docs/ARCHITECTURE_ERP_V4.md.
  if (
    !DB.numberSequences ||
    typeof DB.numberSequences !== 'object' ||
    Array.isArray(DB.numberSequences)
  ) {
    DB.numberSequences = {};
  }
  // Phase 2a/3a GL + costing collections.
  if (!Array.isArray(DB.accountsChart)) {
    DB.accountsChart = [];
  }
  if (!Array.isArray(DB.journals)) {
    DB.journals = [];
  }
  // journals (Accurate-sourced JVs, _accurateId) + accountsChart now come from
  // the auth-gated glSeed collection via loadGlSeed() (Firestore mode), or from
  // the persisted local snapshot (local mode). Nothing to supplement here.
  if (!Array.isArray(DB.itemAdjustments)) {
    DB.itemAdjustments = [];
  }
  // Phase 4: invoice & receipt doc types.
  if (!Array.isArray(DB.salesInvoices)) {
    DB.salesInvoices = [];
  }
  if (!Array.isArray(DB.purchaseInvoices)) {
    DB.purchaseInvoices = [];
  }
  if (!Array.isArray(DB.salesReceipts)) {
    DB.salesReceipts = [];
  }
  if (!Array.isArray(DB.purchasePayments)) {
    DB.purchasePayments = [];
  }
  if (!DB.settings) {
    DB.settings = getDefaultValue('settings');
  }
  if (!DB.settings.tax) {
    DB.settings.tax = getDefaultValue('settings').tax;
  }
  if (!Array.isArray(DB.settings.users)) {
    DB.settings.users = [];
  }
  if (!Array.isArray(DB.settings.itemCategories)) {
    DB.settings.itemCategories = getDefaultValue('settings').itemCategories;
  }
  if (!Array.isArray(DB.settings.units)) {
    DB.settings.units = getDefaultValue('settings').units;
  }
  if (!Array.isArray(DB.settings.assetCategories)) {
    DB.settings.assetCategories = getDefaultValue('settings').assetCategories;
  }
  if (!Array.isArray(DB.settings.assetFiscalCategories)) {
    DB.settings.assetFiscalCategories = getDefaultValue('settings').assetFiscalCategories;
  }
  if (!Array.isArray(DB.settings.assets)) {
    DB.settings.assets = [];
  }
  if (!Array.isArray(DB.settings.assetTransfers)) {
    DB.settings.assetTransfers = [];
  }
  if (!Array.isArray(DB.settings.assetDisposals)) {
    DB.settings.assetDisposals = [];
  }
  // Budget & GL extras
  if (!Array.isArray(DB.budgets)) {
    DB.budgets = [];
  }
  if (!Array.isArray(DB.budgetTransfers)) {
    DB.budgetTransfers = [];
  }
  if (!Array.isArray(DB.expenseAccruals)) {
    DB.expenseAccruals = [];
  }
  if (!Array.isArray(DB.employees)) {
    DB.employees = [];
  }
  if (!Array.isArray(DB.payrollRuns)) {
    DB.payrollRuns = [];
  }
  // Sales & Purchase extras
  if (!Array.isArray(DB.salesDownPayments)) {
    DB.salesDownPayments = [];
  }
  if (!Array.isArray(DB.purchaseDownPayments)) {
    DB.purchaseDownPayments = [];
  }
  if (!Array.isArray(DB.salesTargets)) {
    DB.salesTargets = [];
  }
  if (!Array.isArray(DB.goodsReceipts)) {
    DB.goodsReceipts = [];
  }
  if (!Array.isArray(DB.supplierPrices)) {
    DB.supplierPrices = [];
  }

  if (DB.settings.users.length === 0 && DB.settings.user && DB.settings.user.name) {
    DB.settings.users = [
      {
        id: 'USR-001',
        name: DB.settings.user.name,
        email: DB.settings.user.email || 'admin@kelola.example',
        role: DB.settings.user.role || 'Administrator',
      },
    ];
  }

  // NOTE: SO/PO status is owned by the sync script (Phase 4, from Accurate's
  // authoritative statusName). The runtime DO-linkage derivation below is kept
  // for Option B but is NOT called automatically — it disagrees with Accurate
  // on ~62% of SOs today (DO qty/itemId don't reconcile), and auto-running it
  // here silently overwrote Accurate's statuses on every load. Re-enable only
  // once linkage agreement is high enough (see the diagnostic in
  // scripts/sync-from-accurate.cjs).

  // Sync the module-local DB variable back to window.DB so classic <script>
  // code (dashboard.js, erp-view.js, gl.js, etc.) sees the same data.
  syncDBGlobal();
}

// Option B (dormant): derive SO/PO status from DO/GR linkage instead of
// Accurate's reported status. NOT called automatically — Accurate is the
// current source of truth (see applyDefaults). Exposed as window.deriveOrderStatuses
// for manual/diagnostic use and as the eventual cutover point once DO qty data
// reconciles with SO lines. Re-deriving only when all orders share one status
// is a guard against the old broken migration mapping.
// Tolerance for comparing summed decimal quantities (see the epsilon note in
// the SO loop below). 0.01 absorbs float drift without masking a real shortfall
// (the smallest real partial in the data is whole units short).
const QTY_EPSILON = 0.01;

function _deriveOrderStatuses() {
  const orders = (DB.salesOrders || []).filter(function (o) {
    return o._type === 'order';
  });
  if (orders.length === 0) {
    return;
  }
  const statuses = {};
  orders.forEach(function (o) {
    statuses[o.status] = (statuses[o.status] || 0) + 1;
  });
  // Only re-derive if all orders share one status (the old broken mapping).
  if (Object.keys(statuses).length > 1) {
    return;
  }

  const doQty = {};
  (DB.deliveryOrders || []).forEach(function (d) {
    if (!d.soId) {
      return;
    }
    const qty = (d.items || d.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    doQty[d.soId] = (doQty[d.soId] || 0) + qty;
  });

  orders.forEach(function (o) {
    const ordered = (o.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    const delivered = doQty[o.id] || 0;
    // EPSILON: decimal stone quantities (m³/ton like 512.5) accumulate
    // floating-point error, so a fully-delivered SO reads 1127.9999998 vs
    // 1128 ordered. Without tolerance these flip to "Partially Processed" and
    // disagree with Accurate (8 SOs ≈ 4% of agreement).
    if (delivered <= QTY_EPSILON) {
      o.status = 'Waiting on Process';
    } else if (delivered >= ordered - QTY_EPSILON) {
      o.status = 'Processed';
    } else {
      o.status = 'Partially Processed';
    }
  });

  // Same for purchase orders
  const pos = (DB.purchaseOrders || []).filter(function (o) {
    return o._type === 'order';
  });
  if (pos.length === 0) {
    return;
  }
  const poStatuses = {};
  pos.forEach(function (o) {
    poStatuses[o.status] = (poStatuses[o.status] || 0) + 1;
  });
  if (Object.keys(poStatuses).length > 1) {
    return;
  }

  const grQty = {};
  (DB.goodsReceipts || []).forEach(function (r) {
    if (!r.poId) {
      return;
    }
    const qty = (r.items || r.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    grQty[r.poId] = (grQty[r.poId] || 0) + qty;
  });

  pos.forEach(function (o) {
    const ordered = (o.lines || []).reduce(function (s, l) {
      return s + (Number(l.qty) || 0);
    }, 0);
    const received = grQty[o.id] || 0;
    if (received <= QTY_EPSILON) {
      o.status = 'Waiting on Process';
    } else if (received >= ordered - QTY_EPSILON) {
      o.status = 'Processed';
    } else {
      o.status = 'Partially Processed';
    }
  });
}

/**
 * Reset database to default data
 */
export async function resetDB() {
  if (
    !confirm('Apakah Anda yakin ingin mereset semua data? Tindakan ini tidak dapat dibatalkan.')
  ) {
    return;
  }

  // Local-first mode: just reseed defaults and persist locally.
  if (usingLocalStore) {
    DB = normalizeImportedDB(defaultData);
    applyDefaults();
    persistLocal();
    if (typeof navigate !== 'undefined' && typeof activeView !== 'undefined') {
      navigate(activeView);
    }
    showToast('Data berhasil direset', 'success');
    return;
  }

  try {
    // Delete all documents in all collections (chunked — 500-op batch limit)
    for (const collectionName of Object.values(COLLECTIONS)) {
      const snapshot = await getDocs(collection(firestore, collectionName));
      const refs = [];
      snapshot.forEach(doc => {
        refs.push(doc.ref);
      });
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(firestore);
        refs.slice(i, i + 450).forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }

    // Reload with defaults
    DB = normalizeImportedDB(defaultData);
    syncDBGlobal();
    // The server was just wiped — clear the dirty-tracking baseline so the
    // full default dataset is written, not just what differs from pre-reset.
    _savedSnapshot.clear();
    await saveDB();

    if (typeof navigate !== 'undefined' && typeof activeView !== 'undefined') {
      navigate(activeView);
    }

    showToast('Data berhasil direset', 'success');
  } catch (error) {
    console.error('Failed to reset database:', error);
    showToast('Gagal mereset data', 'danger');
  }
}

/**
 * Normalize imported data structure
 */
function normalizeImportedDB(raw) {
  const clone = v => JSON.parse(JSON.stringify(v));
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const data = clone(input);

  Object.keys(defaultData).forEach(key => {
    if (!(key in data)) {
      data[key] = clone(defaultData[key]);
    }
  });

  const arrayKeys = [
    'salesOrders',
    'purchaseOrders',
    'inventoryItems',
    'deliveryOrders',
    'notifications',
    'customers',
    'suppliers',
    'revenueData',
    'topProducts',
    'accountsTrend',
    'fleet',
    'expedition',
    'paymentLogs',
  ];

  arrayKeys.forEach(key => {
    if (!Array.isArray(data[key])) {
      data[key] = clone(defaultData[key] || []);
    }
  });

  if (!data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) {
    data.accounts = clone(defaultData.accounts || { cash: 0, bca: 0, mandiri: 0 });
  } else {
    data.accounts = { ...(defaultData.accounts || {}), ...data.accounts };
  }

  if (
    !data.reservations ||
    typeof data.reservations !== 'object' ||
    Array.isArray(data.reservations)
  ) {
    data.reservations = {};
  }

  _coerceIdsToString(data);

  return data;
}

// The demo seed uses numeric ids (1, 2, …), but everything the app creates at
// runtime uses string ids and DOM `data-id` attributes are ALWAYS strings. With
// strict `doc.id === datasetId` lookups all over the codebase, numeric-id demo
// docs become un-clickable ("tidak ditemukan") on a fresh seed. Coerce ids and
// their cross-reference fields to strings here so both seed and app-created docs
// behave identically. Idempotent for ids that are already strings.
function _coerceIdsToString(data) {
  const S = v => (v === null || v === undefined ? v : String(v));
  const REF = ['soId', 'poId', 'customerId', 'supplierId', 'invoiceId', 'orderId', 'sourceId'];
  const COLLS = [
    'salesOrders',
    'purchaseOrders',
    'deliveryOrders',
    'salesInvoices',
    'purchaseInvoices',
    'salesReceipts',
    'purchasePayments',
    'salesQuotations',
    'purchaseQuotations',
    'salesReturns',
    'purchaseReturns',
    'customers',
    'suppliers',
    'inventoryItems',
    'paymentLogs',
    'itemTransfers',
    'itemAdjustments',
  ];
  COLLS.forEach(c => {
    const arr = data[c];
    if (!Array.isArray(arr)) {
      return;
    }
    arr.forEach(d => {
      if (!d || typeof d !== 'object') {
        return;
      }
      if ('id' in d) {
        d.id = S(d.id);
      }
      REF.forEach(f => {
        if (f in d && d[f] !== null && d[f] !== undefined) {
          d[f] = S(d[f]);
        }
      });
      if (Array.isArray(d.lines)) {
        d.lines.forEach(l => {
          if (l && 'itemId' in l && l.itemId !== null && l.itemId !== undefined) {
            l.itemId = S(l.itemId);
          }
        });
      }
    });
  });
}

// Default data structure
// ── Demo seed data ───────────────────────────────────────────────────────────
// Small, obviously-generic dataset so every screen is populated on first run.
// Carries NO real business records. The chart of accounts is auto-seeded by
// window.GL.ensureChart() (generic Indonesian CoA), so it stays empty here.
const _seedCustomers = [
  {
    id: 1,
    name: 'CV Mitra Sejahtera',
    phone: '021-5550101',
    address: 'Jakarta',
    email: 'order@mitrasejahtera.example',
    npwp: '',
  },
  {
    id: 2,
    name: 'PT Andalan Niaga',
    phone: '021-5550102',
    address: 'Bandung',
    email: 'po@andalanniaga.example',
    npwp: '',
  },
  {
    id: 3,
    name: 'Toko Berkah Jaya',
    phone: '021-5550103',
    address: 'Surabaya',
    email: 'berkah@example.com',
    npwp: '',
  },
  {
    id: 4,
    name: 'PT Cahaya Abadi',
    phone: '021-5550104',
    address: 'Jakarta',
    email: 'purchasing@cahayaabadi.example',
    npwp: '',
  },
  {
    id: 5,
    name: 'CV Sumber Rejeki',
    phone: '024-5550105',
    address: 'Semarang',
    email: 'order@sumberrejeki.example',
    npwp: '',
  },
  {
    id: 6,
    name: 'Toko Maju Mundur',
    phone: '0274-5550106',
    address: 'Yogyakarta',
    email: 'majumundur@example.com',
    npwp: '',
  },
  {
    id: 7,
    name: 'PT Bintang Timur',
    phone: '061-5550107',
    address: 'Medan',
    email: 'po@bintangtimur.example',
    npwp: '',
  },
  {
    id: 8,
    name: 'UD Sinar Terang',
    phone: '0411-5550108',
    address: 'Makassar',
    email: 'sinarterang@example.com',
    npwp: '',
  },
];

const _seedSuppliers = [
  {
    id: 1,
    name: 'PT Sumber Makmur',
    contact: 'Budi',
    phone: '021-5560201',
    address: 'Tangerang',
    npwp: '',
  },
  {
    id: 2,
    name: 'CV Karya Abadi',
    contact: 'Sari',
    phone: '021-5560202',
    address: 'Bekasi',
    npwp: '',
  },
  { id: 3, name: 'UD Sentosa', contact: 'Adi', phone: '021-5560203', address: 'Depok', npwp: '' },
  {
    id: 4,
    name: 'PT Global Supplindo',
    contact: 'Rina',
    phone: '021-5560204',
    address: 'Jakarta',
    npwp: '',
  },
  {
    id: 5,
    name: 'CV Mandiri Teknik',
    contact: 'Hendra',
    phone: '022-5560205',
    address: 'Bandung',
    npwp: '',
  },
  {
    id: 6,
    name: 'PT Anugerah Material',
    contact: 'Wati',
    phone: '031-5560206',
    address: 'Surabaya',
    npwp: '',
  },
];

const _seedItems = [
  {
    id: 1,
    code: 'AS001',
    name: 'AGREGAT SLAG 0-5 MM',
    category: 'Umum',
    unit: 'Ton',
    stock: 340,
    min: 30,
    cost: 43000,
    sell: 57000,
    warehouseStock: {
      'WH-DEFAULT': 340,
    },
  },
  {
    id: 2,
    code: 'AS003',
    name: 'AGREGAT SLAG 10-20 MM',
    category: 'Umum',
    unit: 'Ton',
    stock: 95,
    min: 25,
    cost: 52000,
    sell: 67000,
    warehouseStock: {
      'WH-DEFAULT': 95,
    },
  },
  {
    id: 3,
    code: 'AS004',
    name: 'AGREGAT SLAG 20-30 MM',
    category: 'Umum',
    unit: 'Ton',
    stock: 60,
    min: 20,
    cost: 53000,
    sell: 67000,
    warehouseStock: {
      'WH-DEFAULT': 60,
    },
  },
  {
    id: 4,
    code: 'AS002',
    name: 'AGREGAT SLAG 5-10 MM',
    category: 'Umum',
    unit: 'Ton',
    stock: 180,
    min: 35,
    cost: 50000,
    sell: 67000,
    warehouseStock: {
      'WH-DEFAULT': 180,
    },
  },
  {
    id: 5,
    code: '100020',
    name: 'BIAYA SEWA ANGKUTAN',
    category: 'Ongkir',
    unit: 'Ton',
    stock: 0,
    min: 0,
    cost: 38000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 6,
    code: 'BA 002',
    name: 'Batu Alam Screening 5-10 mm',
    category: 'Umum',
    unit: 'M3',
    stock: 45,
    min: 10,
    cost: 78000,
    sell: 101000,
    warehouseStock: {
      'WH-DEFAULT': 45,
    },
  },
  {
    id: 7,
    code: 'BAT 002',
    name: 'Batu Alam Screening 5-10 mm',
    category: 'Umum',
    unit: 'Ton',
    stock: 130,
    min: 15,
    cost: 84000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 130,
    },
  },
  {
    id: 8,
    code: 'BAT 003',
    name: 'Batu Alam Split 10-20 mm',
    category: 'Umum',
    unit: 'Ton',
    stock: 520,
    min: 40,
    cost: 108000,
    sell: 145000,
    warehouseStock: {
      'WH-DEFAULT': 520,
    },
  },
  {
    id: 9,
    code: 'BA 003',
    name: 'Batu Alam Split 10-20 mm',
    category: 'Umum',
    unit: 'M3',
    stock: 70,
    min: 12,
    cost: 152000,
    sell: 200000,
    warehouseStock: {
      'WH-DEFAULT': 70,
    },
  },
  {
    id: 10,
    code: 'BAT 004',
    name: 'Batu Alam Split 20-30 mm',
    category: 'Umum',
    unit: 'Ton',
    stock: 610,
    min: 45,
    cost: 96000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 610,
    },
  },
  {
    id: 11,
    code: 'BA 004',
    name: 'Batu Alam Split 20-30 mm',
    category: 'Umum',
    unit: 'M3',
    stock: 55,
    min: 8,
    cost: 140000,
    sell: 185000,
    warehouseStock: {
      'WH-DEFAULT': 55,
    },
  },
  {
    id: 12,
    code: 'BA 001',
    name: 'Batu Alam abu batu 0-5 mm',
    category: 'Umum',
    unit: 'M3',
    stock: 0,
    min: 0,
    cost: 46000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 13,
    code: 'BAT 001',
    name: 'Batu Alam abu batu 0-5 mm',
    category: 'Umum',
    unit: 'Ton',
    stock: 240,
    min: 28,
    cost: 49000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 240,
    },
  },
  {
    id: 14,
    code: '100019',
    name: 'JASA PENGIRIMAN',
    category: 'Ongkir',
    unit: 'Ton',
    stock: 0,
    min: 0,
    cost: 30000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 15,
    code: '100021',
    name: 'JASA TRAINING',
    category: 'Umum',
    unit: '',
    stock: 0,
    min: 0,
    cost: 500000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 16,
    code: '100025',
    name: 'Pasir Alam-Leles',
    category: 'Umum',
    unit: 'Ton',
    stock: 150,
    min: 32,
    cost: 121000,
    sell: 157500,
    warehouseStock: {
      'WH-DEFAULT': 150,
    },
  },
  {
    id: 17,
    code: '100026',
    name: 'jasa pengiriman',
    category: 'Ongkir',
    unit: 'M3',
    stock: 0,
    min: 0,
    cost: 1800000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 18,
    code: '100027',
    name: 'jasa pengiriman rit',
    category: 'Ongkir',
    unit: 'ritase',
    stock: 0,
    min: 0,
    cost: 2200000,
    sell: 0,
    warehouseStock: {
      'WH-DEFAULT': 0,
    },
  },
  {
    id: 19,
    code: 'T00001',
    name: 'ongkir',
    category: 'Umum',
    unit: 'Ton',
    stock: 90,
    min: 18,
    cost: 47000,
    sell: 60000,
    warehouseStock: {
      'WH-DEFAULT': 90,
    },
  },
];

const _seedSalesOrders = [
  {
    id: 1,
    number: undefined,
    customer: 'CV Mitra Sejahtera',
    customerId: 1,
    date: '2026-06-01',
    dueDate: '2026-07-01',
    status: 'Draft',
    taxRate: 0.11,
    tax: 431200,
    amount: 4351200,
    stockMutated: false,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 10,
        price: 57000,
        lineDiscount: 0,
        subtotal: 570000,
      },
      {
        itemId: 3,
        itemName: 'AGREGAT SLAG 20-30 MM',
        unit: 'Ton',
        qty: 50,
        price: 67000,
        lineDiscount: 0,
        subtotal: 3350000,
      },
    ],
  },
  {
    id: 2,
    number: undefined,
    customer: 'PT Andalan Niaga',
    customerId: 2,
    date: '2026-06-05',
    dueDate: '2026-07-05',
    status: 'Confirmed',
    taxRate: 0.11,
    tax: 36850,
    amount: 371850,
    stockMutated: false,
    lines: [
      {
        itemId: 2,
        itemName: 'AGREGAT SLAG 10-20 MM',
        unit: 'Ton',
        qty: 5,
        price: 67000,
        lineDiscount: 0,
        subtotal: 335000,
      },
    ],
  },
  {
    id: 3,
    number: undefined,
    customer: 'Toko Berkah Jaya',
    customerId: 3,
    date: '2026-05-20',
    dueDate: '2026-06-20',
    status: 'Processed',
    taxRate: 0.11,
    tax: 4422000,
    amount: 44622000,
    stockMutated: true,
    lines: [
      {
        itemId: 6,
        itemName: 'Batu Alam Screening 5-10 mm',
        unit: 'M3',
        qty: 200,
        price: 101000,
        lineDiscount: 0,
        subtotal: 20200000,
      },
      {
        itemId: 9,
        itemName: 'Batu Alam Split 10-20 mm',
        unit: 'M3',
        qty: 100,
        price: 200000,
        lineDiscount: 0,
        subtotal: 20000000,
      },
    ],
  },
  {
    id: 4,
    number: undefined,
    customer: 'PT Cahaya Abadi',
    customerId: 4,
    date: '2026-05-28',
    dueDate: '2026-06-28',
    status: 'Confirmed',
    taxRate: 0.11,
    tax: 478500,
    amount: 4828500,
    stockMutated: false,
    lines: [
      {
        itemId: 16,
        itemName: 'Pasir Alam-Leles',
        unit: 'Ton',
        qty: 20,
        price: 157500,
        lineDiscount: 0,
        subtotal: 3150000,
      },
      {
        itemId: 19,
        itemName: 'ongkir',
        unit: 'Ton',
        qty: 20,
        price: 60000,
        lineDiscount: 0,
        subtotal: 1200000,
      },
    ],
  },
  {
    id: 5,
    number: undefined,
    customer: 'CV Sumber Rejeki',
    customerId: 5,
    date: '2026-06-08',
    dueDate: '2026-07-08',
    status: 'Draft',
    taxRate: 0.11,
    tax: 73700,
    amount: 743700,
    stockMutated: false,
    lines: [
      {
        itemId: 4,
        itemName: 'AGREGAT SLAG 5-10 MM',
        unit: 'Ton',
        qty: 10,
        price: 67000,
        lineDiscount: 0,
        subtotal: 670000,
      },
    ],
  },
  {
    id: 6,
    number: undefined,
    customer: 'Toko Maju Mundur',
    customerId: 6,
    date: '2026-06-10',
    dueDate: '2026-07-10',
    status: 'Confirmed',
    taxRate: 0.11,
    tax: 507100,
    amount: 5117100,
    stockMutated: false,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 30,
        price: 57000,
        lineDiscount: 0,
        subtotal: 1710000,
      },
      {
        itemId: 8,
        itemName: 'Batu Alam Split 10-20 mm',
        unit: 'Ton',
        qty: 20,
        price: 145000,
        lineDiscount: 0,
        subtotal: 2900000,
      },
    ],
  },
  {
    id: 7,
    number: undefined,
    customer: 'PT Bintang Timur',
    customerId: 7,
    date: '2026-06-12',
    dueDate: '2026-07-12',
    status: 'Processed',
    taxRate: 0.11,
    tax: 627000,
    amount: 6327000,
    stockMutated: true,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 100,
        price: 57000,
        lineDiscount: 0,
        subtotal: 5700000,
      },
    ],
  },
  {
    id: 8,
    number: undefined,
    customer: 'UD Sinar Terang',
    customerId: 8,
    date: '2026-06-13',
    dueDate: '2026-07-13',
    status: 'Draft',
    taxRate: 0.11,
    tax: 442200,
    amount: 4462200,
    stockMutated: false,
    lines: [
      {
        itemId: 2,
        itemName: 'AGREGAT SLAG 10-20 MM',
        unit: 'Ton',
        qty: 50,
        price: 67000,
        lineDiscount: 0,
        subtotal: 3350000,
      },
      {
        itemId: 4,
        itemName: 'AGREGAT SLAG 5-10 MM',
        unit: 'Ton',
        qty: 10,
        price: 67000,
        lineDiscount: 0,
        subtotal: 670000,
      },
    ],
  },
];

const _seedPurchaseOrders = [
  {
    id: 1,
    number: undefined,
    supplier: 'PT Sumber Makmur',
    supplierId: 1,
    date: '2026-06-02',
    status: 'Draft',
    taxRate: 0.11,
    tax: 3047000,
    amount: 30747000,
    stockMutated: false,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 100,
        price: 43000,
        lineDiscount: 0,
        subtotal: 4300000,
      },
      {
        itemId: 6,
        itemName: 'Batu Alam Screening 5-10 mm',
        unit: 'M3',
        qty: 300,
        price: 78000,
        lineDiscount: 0,
        subtotal: 23400000,
      },
    ],
  },
  {
    id: 2,
    number: undefined,
    supplier: 'CV Karya Abadi',
    supplierId: 2,
    date: '2026-05-25',
    status: 'Received',
    taxRate: 0.11,
    tax: 57200,
    amount: 577200,
    stockMutated: true,
    lines: [
      {
        itemId: 2,
        itemName: 'AGREGAT SLAG 10-20 MM',
        unit: 'Ton',
        qty: 10,
        price: 52000,
        lineDiscount: 0,
        subtotal: 520000,
      },
    ],
  },
  {
    id: 3,
    number: undefined,
    supplier: 'PT Global Supplindo',
    supplierId: 4,
    date: '2026-06-04',
    status: 'Confirmed',
    taxRate: 0.11,
    tax: 554400,
    amount: 5594400,
    stockMutated: false,
    lines: [
      {
        itemId: 16,
        itemName: 'Pasir Alam-Leles',
        unit: 'Ton',
        qty: 30,
        price: 121000,
        lineDiscount: 0,
        subtotal: 3630000,
      },
      {
        itemId: 19,
        itemName: 'ongkir',
        unit: 'Ton',
        qty: 30,
        price: 47000,
        lineDiscount: 0,
        subtotal: 1410000,
      },
    ],
  },
  {
    id: 4,
    number: undefined,
    supplier: 'PT Anugerah Material',
    supplierId: 6,
    date: '2026-06-09',
    status: 'Draft',
    taxRate: 0.11,
    tax: 1001000,
    amount: 10101000,
    stockMutated: false,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 200,
        price: 43000,
        lineDiscount: 0,
        subtotal: 8600000,
      },
      {
        itemId: 4,
        itemName: 'AGREGAT SLAG 5-10 MM',
        unit: 'Ton',
        qty: 10,
        price: 50000,
        lineDiscount: 0,
        subtotal: 500000,
      },
    ],
  },
];

const _seedDeliveryOrders = [
  {
    id: 1,
    number: undefined,
    soId: 1,
    poId: null,
    customer: 'CV Mitra Sejahtera',
    customerId: 1,
    supplierId: null,
    destination: 'Jakarta',
    date: '2026-06-03',
    status: 'Delivered',
    driver: 'Andi',
    vehicle: 'B 1234 XYZ',
    customerPO: '',
    notes: '',
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 10,
        price: 57000,
        lineDiscount: 0,
        subtotal: 570000,
      },
      {
        itemId: 3,
        itemName: 'AGREGAT SLAG 20-30 MM',
        unit: 'Ton',
        qty: 50,
        price: 67000,
        lineDiscount: 0,
        subtotal: 3350000,
      },
    ],
  },
  {
    id: 2,
    number: undefined,
    soId: 3,
    poId: null,
    customer: 'Toko Berkah Jaya',
    customerId: 3,
    supplierId: null,
    destination: 'Surabaya',
    date: '2026-05-22',
    status: 'Sent',
    driver: 'Budi',
    vehicle: 'B 5678 ABC',
    customerPO: '',
    notes: '',
    lines: [
      {
        itemId: 6,
        itemName: 'Batu Alam Screening 5-10 mm',
        unit: 'M3',
        qty: 200,
        price: 101000,
        lineDiscount: 0,
        subtotal: 20200000,
      },
      {
        itemId: 9,
        itemName: 'Batu Alam Split 10-20 mm',
        unit: 'M3',
        qty: 100,
        price: 200000,
        lineDiscount: 0,
        subtotal: 20000000,
      },
    ],
  },
  {
    id: 3,
    number: undefined,
    soId: 7,
    poId: null,
    customer: 'PT Bintang Timur',
    customerId: 7,
    supplierId: null,
    destination: 'Medan',
    date: '2026-06-13',
    status: 'Invoiced',
    driver: 'Citra',
    vehicle: 'B 9012 DEF',
    customerPO: '',
    notes: '',
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 100,
        price: 57000,
        lineDiscount: 0,
        subtotal: 5700000,
      },
    ],
  },
  {
    id: 4,
    number: undefined,
    soId: 4,
    poId: null,
    customer: 'PT Cahaya Abadi',
    customerId: 4,
    supplierId: null,
    destination: 'Jakarta',
    date: '2026-05-30',
    status: 'Sent',
    driver: 'Dedi',
    vehicle: 'B 3456 GHI',
    customerPO: '',
    notes: '',
    lines: [
      {
        itemId: 16,
        itemName: 'Pasir Alam-Leles',
        unit: 'Ton',
        qty: 20,
        price: 157500,
        lineDiscount: 0,
        subtotal: 3150000,
      },
      {
        itemId: 19,
        itemName: 'ongkir',
        unit: 'Ton',
        qty: 20,
        price: 60000,
        lineDiscount: 0,
        subtotal: 1200000,
      },
    ],
  },
];

const _seedSalesInvoices = [
  {
    id: 1,
    number: undefined,
    soId: 2,
    customer: 'PT Andalan Niaga',
    customerId: 2,
    date: '2026-06-06',
    dueDate: '2026-07-06',
    status: 'Unpaid',
    taxRate: 0.11,
    tax: 36850,
    amount: 371850,
    paid: 0,
    lines: [
      {
        itemId: 2,
        itemName: 'AGREGAT SLAG 10-20 MM',
        unit: 'Ton',
        qty: 5,
        price: 67000,
        lineDiscount: 0,
        subtotal: 335000,
      },
    ],
  },
  {
    id: 2,
    number: undefined,
    soId: 3,
    customer: 'Toko Berkah Jaya',
    customerId: 3,
    date: '2026-05-23',
    dueDate: '2026-06-23',
    status: 'Paid',
    taxRate: 0.11,
    tax: 4422000,
    amount: 44622000,
    paid: 44622000,
    lines: [
      {
        itemId: 6,
        itemName: 'Batu Alam Screening 5-10 mm',
        unit: 'M3',
        qty: 200,
        price: 101000,
        lineDiscount: 0,
        subtotal: 20200000,
      },
      {
        itemId: 9,
        itemName: 'Batu Alam Split 10-20 mm',
        unit: 'M3',
        qty: 100,
        price: 200000,
        lineDiscount: 0,
        subtotal: 20000000,
      },
    ],
  },
  {
    id: 3,
    number: undefined,
    soId: 7,
    customer: 'PT Bintang Timur',
    customerId: 7,
    date: '2026-06-13',
    dueDate: '2026-07-13',
    status: 'Unpaid',
    taxRate: 0.11,
    tax: 627000,
    amount: 6327000,
    paid: 0,
    lines: [
      {
        itemId: 1,
        itemName: 'AGREGAT SLAG 0-5 MM',
        unit: 'Ton',
        qty: 100,
        price: 57000,
        lineDiscount: 0,
        subtotal: 5700000,
      },
    ],
  },
  {
    id: 4,
    number: undefined,
    soId: 4,
    customer: 'PT Cahaya Abadi',
    customerId: 4,
    date: '2026-06-01',
    dueDate: '2026-07-01',
    status: 'Unpaid',
    taxRate: 0.11,
    tax: 478500,
    amount: 4828500,
    paid: 0,
    lines: [
      {
        itemId: 16,
        itemName: 'Pasir Alam-Leles',
        unit: 'Ton',
        qty: 20,
        price: 157500,
        lineDiscount: 0,
        subtotal: 3150000,
      },
      {
        itemId: 19,
        itemName: 'ongkir',
        unit: 'Ton',
        qty: 20,
        price: 60000,
        lineDiscount: 0,
        subtotal: 1200000,
      },
    ],
  },
];

const _seedPurchaseInvoices = [
  {
    id: 1,
    number: undefined,
    poId: 2,
    supplier: 'CV Karya Abadi',
    supplierId: 2,
    date: '2026-05-26',
    dueDate: '2026-06-26',
    status: 'Unpaid',
    taxRate: 0.11,
    tax: 57200,
    amount: 577200,
    paid: 0,
    lines: [
      {
        itemId: 2,
        itemName: 'AGREGAT SLAG 10-20 MM',
        unit: 'Ton',
        qty: 10,
        price: 52000,
        lineDiscount: 0,
        subtotal: 520000,
      },
    ],
  },
  {
    id: 2,
    number: undefined,
    poId: 3,
    supplier: 'PT Global Supplindo',
    supplierId: 4,
    date: '2026-06-05',
    dueDate: '2026-07-05',
    status: 'Paid',
    taxRate: 0.11,
    tax: 554400,
    amount: 5594400,
    paid: 5594400,
    lines: [
      {
        itemId: 16,
        itemName: 'Pasir Alam-Leles',
        unit: 'Ton',
        qty: 30,
        price: 121000,
        lineDiscount: 0,
        subtotal: 3630000,
      },
      {
        itemId: 19,
        itemName: 'ongkir',
        unit: 'Ton',
        qty: 30,
        price: 47000,
        lineDiscount: 0,
        subtotal: 1410000,
      },
    ],
  },
];

const _seedSalesReceipts = [
  {
    id: 1,
    number: undefined,
    date: '2026-05-24',
    status: 'Posted',
    customer: 'Toko Berkah Jaya',
    customerId: 3,
    invoiceId: 2,
    amount: 44622000,
    paymentMethod: 'transfer',
    note: 'Pelunasan faktur',
  },
];

const _seedPurchasePayments = [
  {
    id: 1,
    number: undefined,
    date: '2026-06-06',
    status: 'Posted',
    supplier: 'PT Global Supplindo',
    supplierId: 4,
    invoiceId: 2,
    amount: 5594400,
    paymentMethod: 'transfer',
    note: 'Pelunasan faktur pembelian',
  },
];

const _seedFleet = [
  { id: 'FLT-001', plate: 'B 1234 XYZ', type: 'Pickup', driver: 'Andi', status: 'OK' },
  { id: 'FLT-002', plate: 'B 5678 ABC', type: 'Box Truck', driver: 'Budi', status: 'In Transit' },
  { id: 'FLT-003', plate: 'B 9012 DEF', type: 'Van', driver: 'Citra', status: 'OK' },
];

const _seedExpedition = [
  { id: 'EXP-001', name: 'JNE Cargo', area: 'Nasional', rate: 'Rp 8.000/kg' },
  { id: 'EXP-002', name: 'SiCepat', area: 'Jawa-Bali', rate: 'Rp 6.500/kg' },
  { id: 'EXP-003', name: 'Dakota Cargo', area: 'Luar Jawa', rate: 'Rp 12.000/kg' },
];

const _seedEmployees = [
  {
    id: 'EMP-001',
    name: 'Andi Wijaya',
    position: 'Sales Manager',
    department: 'Penjualan',
    phone: '0812-1000-001',
    email: 'andi@kelola.example',
    joinDate: '2023-01-15',
    salary: 9000000,
    status: 'Active',
  },
  {
    id: 'EMP-002',
    name: 'Budi Santoso',
    position: 'Driver',
    department: 'Logistik',
    phone: '0812-1000-002',
    email: 'budi@kelola.example',
    joinDate: '2023-03-01',
    salary: 5000000,
    status: 'Active',
  },
  {
    id: 'EMP-003',
    name: 'Citra Lestari',
    position: 'Admin Gudang',
    department: 'Gudang',
    phone: '0812-1000-003',
    email: 'citra@kelola.example',
    joinDate: '2023-06-10',
    salary: 5500000,
    status: 'Active',
  },
  {
    id: 'EMP-004',
    name: 'Dedi Kurniawan',
    position: 'Staff Pembelian',
    department: 'Pembelian',
    phone: '0812-1000-004',
    email: 'dedi@kelola.example',
    joinDate: '2024-02-20',
    salary: 6000000,
    status: 'Active',
  },
  {
    id: 'EMP-005',
    name: 'Eka Putri',
    position: 'Akuntan',
    department: 'Keuangan',
    phone: '0812-1000-005',
    email: 'eka@kelola.example',
    joinDate: '2024-08-05',
    salary: 7500000,
    status: 'Active',
  },
  {
    id: 'EMP-006',
    name: 'Fajar Nugroho',
    position: 'Staff Sales',
    department: 'Penjualan',
    phone: '0812-1000-006',
    email: 'fajar@kelola.example',
    joinDate: '2025-01-12',
    salary: 4500000,
    status: 'Probation',
  },
];

const _seedPaymentLogs = [
  {
    id: 1,
    type: 'SO',
    orderId: 3,
    date: '2026-05-24',
    amount: 44622000,
    method: 'transfer',
    note: 'Penerimaan dari Toko Berkah Jaya',
  },
  {
    id: 2,
    type: 'PO',
    orderId: 3,
    date: '2026-06-06',
    amount: 5594400,
    method: 'transfer',
    note: 'Pembayaran ke PT Global Supplindo',
  },
];

// ── Keep the seed dataset's dates "fresh" relative to today ────────────────────
// The hand-written seed data above was authored with 2026-06-13 in mind as
// "today" (its most recent non-trend date). Rather than editing dozens of
// literal dates whenever this file is read months or years later, shift every
// `date` / `dueDate` field in the seed arrays by the same day-offset as
// (today − that reference date), so the demo's recent activity always looks
// like it happened in the last few weeks, no matter when it's actually run.
const _SEED_REFERENCE_DATE = '2026-06-13';
function _dayOffsetFromReference() {
  const ref = new Date(`${_SEED_REFERENCE_DATE}T00:00:00`);
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayMidnight - ref) / 86400000);
}
function _shiftIsoDate(iso, days) {
  if (!iso || typeof iso !== 'string') return iso;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return iso;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function _shiftSeedDates(rows, days) {
  rows.forEach(row => {
    if (row.date) row.date = _shiftIsoDate(row.date, days);
    if (row.dueDate) row.dueDate = _shiftIsoDate(row.dueDate, days);
  });
  return rows;
}
const _seedDayShift = _dayOffsetFromReference();
[
  _seedSalesOrders,
  _seedPurchaseOrders,
  _seedDeliveryOrders,
  _seedSalesInvoices,
  _seedPurchaseInvoices,
  _seedSalesReceipts,
  _seedPurchasePayments,
  _seedPaymentLogs,
].forEach(rows => _shiftSeedDates(rows, _seedDayShift));

// Twelve months of confirmed sales/purchase orders so the dashboard "Tren
// Bulanan" (12-month) chart shows a real trend instead of a flat line. Dates are
// computed relative to today; amounts are deterministic (no RNG) for stable builds.
function _monthlyTrendOrders() {
  const salesM = [8, 11, 9, 13, 15, 12, 17, 14, 19, 16, 21, 24]; // in millions
  const purchM = [5, 7, 6, 8, 9, 7, 10, 8, 11, 9, 12, 14];
  const so = [];
  const po = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const idx = 11 - i;
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    const cust = _seedCustomers[idx % _seedCustomers.length];
    const sup = _seedSuppliers[idx % _seedSuppliers.length];
    const it = _seedItems[idx % _seedItems.length];
    const sAmt = salesM[idx] * 1000000;
    const pAmt = purchM[idx] * 1000000;
    so.push({
      id: 100 + idx,
      number: undefined,
      customer: cust.name,
      customerId: cust.id,
      date,
      status: 'Confirmed',
      taxRate: 0,
      tax: 0,
      amount: sAmt,
      stockMutated: false,
      lines: [
        {
          itemId: it.id,
          itemName: it.name,
          unit: it.unit,
          qty: 1,
          price: sAmt,
          lineDiscount: 0,
          subtotal: sAmt,
        },
      ],
    });
    po.push({
      id: 100 + idx,
      number: undefined,
      supplier: sup.name,
      supplierId: sup.id,
      date,
      status: 'Confirmed',
      taxRate: 0,
      tax: 0,
      amount: pAmt,
      stockMutated: false,
      lines: [
        {
          itemId: it.id,
          itemName: it.name,
          unit: it.unit,
          qty: 1,
          price: pAmt,
          lineDiscount: 0,
          subtotal: pAmt,
        },
      ],
    });
  }
  return { so, po };
}
const _trend = _monthlyTrendOrders();

const defaultData = {
  salesOrders: _seedSalesOrders.concat(_trend.so),
  purchaseOrders: _seedPurchaseOrders.concat(_trend.po),
  inventoryItems: _seedItems,
  deliveryOrders: _seedDeliveryOrders,
  customers: _seedCustomers,
  suppliers: _seedSuppliers,
  paymentLogs: _seedPaymentLogs,
  notifications: [],
  fleet: _seedFleet,
  expedition: _seedExpedition,
  employees: _seedEmployees,
  warehouses: [{ id: 'WH-DEFAULT', name: 'Gudang Utama', location: 'Default', active: true }],
  itemTransfers: [],
  accounts: { cash: 25000000, bca: 150000000, mandiri: 80000000 },
  reservations: {},
  numberSequences: {},
  accountsChart: [],
  journals: [],
  itemAdjustments: [],
  salesInvoices: _seedSalesInvoices,
  purchaseInvoices: _seedPurchaseInvoices,
  salesReceipts: _seedSalesReceipts,
  purchasePayments: _seedPurchasePayments,
  settings: getDefaultValue('settings'),
};

// Clean up on page unload — push any debounced save out before the listeners go.
window.addEventListener('beforeunload', () => {
  try {
    flushPendingSaves();
  } catch (_) {
    /* ignore */
  }
  cleanupListeners();
});

// Export for global access
window.loadDB = loadDB;
window.saveDB = saveDB;
window.resetDB = resetDB;
window.migrateLocalToFirestore = migrateLocalToFirestore;
// Dormant Option-B helper: derive SO/PO statuses from DO/GR linkage on demand.
window.deriveOrderStatuses = _deriveOrderStatuses;
