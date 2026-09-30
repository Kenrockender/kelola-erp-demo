// ═══════════════════════════════════════════════════════════════════════════════
// INDEXEDDB WRAPPER - Offline-first data persistence
// Provides local caching with automatic sync to Firestore
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME = 'KelolaERP';
const DB_VERSION = 1;
const STORES = {
  salesOrders: 'salesOrders',
  purchaseOrders: 'purchaseOrders',
  inventoryItems: 'inventoryItems',
  customers: 'customers',
  suppliers: 'suppliers',
  deliveryOrders: 'deliveryOrders',
  syncQueue: 'syncQueue',
  metadata: 'metadata',
};

/**
 * Valid IndexedDB keys are numbers (not NaN), strings, valid Dates, binary
 * data, arrays of valid keys, or an IDBKeyRange. Notably booleans, null and
 * undefined are NOT valid keys — passing one to IDBIndex.getAll() throws
 * DataError, and records whose indexed property holds one are never indexed.
 */
export function isValidIDBKey(value) {
  if (typeof value === 'number') {
    return !Number.isNaN(value);
  }
  if (typeof value === 'string') {
    return true;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (Array.isArray(value)) {
    return value.every(isValidIDBKey);
  }
  if (
    typeof ArrayBuffer !== 'undefined' &&
    (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
  ) {
    return true;
  }
  if (typeof IDBKeyRange !== 'undefined' && value instanceof IDBKeyRange) {
    return true;
  }
  return false;
}

// Exponential backoff for failed syncs: 30s, 1m, 2m, ... capped at 10 minutes.
const SYNC_BACKOFF_BASE_MS = 30 * 1000;
const SYNC_BACKOFF_MAX_MS = 10 * 60 * 1000;

class IndexedDBManager {
  constructor() {
    this.db = null;
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncFailures = 0;
    this.syncBlockedUntil = 0;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncToFirestore();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // Create object stores
        Object.values(STORES).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });

            // Add indexes for common queries
            if (storeName !== 'metadata' && storeName !== 'syncQueue') {
              store.createIndex('date', 'date', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }

            if (storeName === 'syncQueue') {
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('synced', 'synced', { unique: false });
            }
          }
        });
      };
    });
  }

  /**
   * Get all records from a store
   */
  async getAll(storeName) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a single record by ID
   */
  async get(storeName, id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add or update a record
   */
  async put(storeName, data) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        // Add to sync queue if online
        if (this.isOnline && storeName !== 'syncQueue' && storeName !== 'metadata') {
          this.addToSyncQueue('put', storeName, data);
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a record
   */
  async delete(storeName, id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        // Add to sync queue if online
        if (this.isOnline && storeName !== 'syncQueue' && storeName !== 'metadata') {
          this.addToSyncQueue('delete', storeName, { id });
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all records from a store
   */
  async clear(storeName) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query records by index
   */
  async query(storeName, indexName, value) {
    // Guard: getAll() throws DataError on invalid keys (booleans, null,
    // undefined). Fail fast with a message that says what was passed.
    if (!isValidIDBKey(value)) {
      throw new TypeError(
        `Invalid IndexedDB key for index "${indexName}" on store "${storeName}": ` +
          `${String(value)} (${typeof value}). Booleans, null and undefined are not valid keys.`
      );
    }
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add operation to sync queue
   */
  async addToSyncQueue(operation, storeName, data) {
    const syncItem = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      storeName,
      data,
      timestamp: Date.now(),
      // 0/1 instead of false/true: booleans are not valid IndexedDB keys, so
      // boolean values are silently excluded from the 'synced' index.
      synced: 0,
    };

    return this.put(STORES.syncQueue, syncItem);
  }

  /**
   * Sync pending changes to Firestore
   */
  async syncToFirestore() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    // Backoff after failures: 'online' can fire repeatedly on a flaky
    // connection, and retrying a failing sync in a tight loop floods the
    // console and (once real Firestore writes happen) its write stream.
    if (Date.now() < this.syncBlockedUntil) {
      return;
    }

    this.syncInProgress = true;
    let itemFailures = 0;

    try {
      // getAll + filter instead of the 'synced' index: legacy queue items
      // stored boolean `synced` values, which are not valid keys and were
      // therefore never indexed — an index query would silently miss them.
      const all = await this.getAll(STORES.syncQueue);
      const queue = all.filter(item => !item.synced);

      for (const item of queue) {
        try {
          // Here you would call your Firestore sync function
          // For now, we'll just mark as synced
          await this.put(STORES.syncQueue, { ...item, synced: 1 });

          // Dispatch event for UI update
          window.dispatchEvent(
            new CustomEvent('sync-progress', {
              detail: { total: queue.length, completed: queue.indexOf(item) + 1 },
            })
          );
        } catch (error) {
          itemFailures++;
          console.error('Sync error for item:', item, error);
        }
      }

      // Clean up old synced items (older than 7 days)
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const allSynced = await this.getAll(STORES.syncQueue);
      const oldItems = allSynced.filter(item => item.synced && item.timestamp < weekAgo);

      for (const item of oldItems) {
        await this.delete(STORES.syncQueue, item.id);
      }

      window.dispatchEvent(new CustomEvent('sync-complete'));

      if (itemFailures > 0) {
        this.recordSyncFailure();
      } else {
        this.syncFailures = 0;
        this.syncBlockedUntil = 0;
      }
    } catch (error) {
      this.recordSyncFailure();
      console.error('Sync failed:', error);
      window.dispatchEvent(new CustomEvent('sync-error', { detail: error }));
    } finally {
      this.syncInProgress = false;
    }
  }

  /** Bump the failure counter and extend the exponential backoff window. */
  recordSyncFailure() {
    this.syncFailures++;
    const delay = Math.min(
      SYNC_BACKOFF_BASE_MS * 2 ** (this.syncFailures - 1),
      SYNC_BACKOFF_MAX_MS
    );
    this.syncBlockedUntil = Date.now() + delay;
  }

  /**
   * Get sync status
   */
  async getSyncStatus() {
    const queue = await this.getAll(STORES.syncQueue);
    const pending = queue.filter(item => !item.synced);

    return {
      total: queue.length,
      pending: pending.length,
      synced: queue.length - pending.length,
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress,
    };
  }

  /**
   * Export data for backup
   */
  async exportData() {
    const data = {};

    for (const storeName of Object.values(STORES)) {
      if (storeName !== 'syncQueue') {
        data[storeName] = await this.getAll(storeName);
      }
    }

    return data;
  }

  /**
   * Import data from backup
   */
  async importData(data) {
    for (const [storeName, records] of Object.entries(data)) {
      if (STORES[storeName]) {
        await this.clear(storeName);
        for (const record of records) {
          await this.put(storeName, record);
        }
      }
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        percentage: ((estimate.usage / estimate.quota) * 100).toFixed(2),
      };
    }
    return null;
  }
}

// Export singleton instance
export const idb = new IndexedDBManager();

// Auto-initialize
if (typeof window !== 'undefined') {
  idb.init().catch(console.error);
}
