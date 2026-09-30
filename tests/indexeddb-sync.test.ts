// Regression tests for the background-sync DataError:
//   "Failed to execute 'getAll' on 'IDBIndex': The parameter is not a valid key"
// syncToFirestore() queried the syncQueue 'synced' index with a boolean, which
// is not a valid IndexedDB key (and boolean values are never indexed at all).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idb, isValidIDBKey } from '../src/core/indexeddb.js';

describe('isValidIDBKey', () => {
  it('rejects booleans, null and undefined', () => {
    expect(isValidIDBKey(false)).toBe(false);
    expect(isValidIDBKey(true)).toBe(false);
    expect(isValidIDBKey(null)).toBe(false);
    expect(isValidIDBKey(undefined)).toBe(false);
    expect(isValidIDBKey({})).toBe(false);
    expect(isValidIDBKey(NaN)).toBe(false);
  });

  it('accepts numbers, strings, dates and arrays of valid keys', () => {
    expect(isValidIDBKey(0)).toBe(true);
    expect(isValidIDBKey(1)).toBe(true);
    expect(isValidIDBKey('Paid')).toBe(true);
    expect(isValidIDBKey(new Date())).toBe(true);
    expect(isValidIDBKey([1, 'a'])).toBe(true);
    expect(isValidIDBKey([true])).toBe(false); // invalid element poisons the array
    expect(isValidIDBKey(new Date('invalid'))).toBe(false);
  });
});

describe('IndexedDBManager.query guard', () => {
  it('rejects invalid keys with a descriptive TypeError instead of DataError', async () => {
    await expect(idb.query('syncQueue', 'synced', false)).rejects.toThrow(TypeError);
    await expect(idb.query('syncQueue', 'synced', false)).rejects.toThrow(/not valid keys/);
    await expect(idb.query('salesOrders', 'status', undefined)).rejects.toThrow(TypeError);
  });
});

describe('IndexedDBManager.syncToFirestore', () => {
  beforeEach(() => {
    idb.isOnline = true;
    idb.syncInProgress = false;
    idb.syncFailures = 0;
    idb.syncBlockedUntil = 0;
    vi.restoreAllMocks();
  });

  it('drains pending items (including legacy boolean synced flags) without index queries', async () => {
    const queue = [
      { id: 'a', synced: false, timestamp: Date.now() }, // legacy boolean
      { id: 'b', synced: 0, timestamp: Date.now() }, // new numeric flag
      { id: 'c', synced: 1, timestamp: Date.now() }, // already synced
    ];
    vi.spyOn(idb, 'getAll').mockResolvedValue(queue);
    const put = vi.spyOn(idb, 'put').mockResolvedValue(undefined);
    vi.spyOn(idb, 'delete').mockResolvedValue(undefined);
    const query = vi.spyOn(idb, 'query');

    await idb.syncToFirestore();

    expect(query).not.toHaveBeenCalled();
    const syncedIds = put.mock.calls.map(([, item]) => (item as { id: string }).id);
    expect(syncedIds).toEqual(['a', 'b']);
    // Marked with the numeric flag so future index queries are possible
    expect(put.mock.calls.every(([, item]) => (item as { synced: number }).synced === 1)).toBe(
      true
    );
    expect(idb.syncFailures).toBe(0);
  });

  it('backs off after a failed sync instead of retrying immediately', async () => {
    const getAll = vi.spyOn(idb, 'getAll').mockRejectedValue(new Error('boom'));

    await idb.syncToFirestore();
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(idb.syncFailures).toBe(1);
    expect(idb.syncBlockedUntil).toBeGreaterThan(Date.now());

    // Immediate retry (e.g. a flapping 'online' event) is skipped
    await idb.syncToFirestore();
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('resets the backoff after a successful sync', async () => {
    idb.syncFailures = 3;
    vi.spyOn(idb, 'getAll').mockResolvedValue([]);
    vi.spyOn(idb, 'delete').mockResolvedValue(undefined);

    await idb.syncToFirestore();

    expect(idb.syncFailures).toBe(0);
    expect(idb.syncBlockedUntil).toBe(0);
  });
});
