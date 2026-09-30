// Regression tests for the Firestore write-quota blowout:
// saveDB() with no arguments used to batch-write EVERY record of every
// collection on each CRUD action, exhausting the free-tier daily write quota
// ("resource-exhausted: Write stream exhausted maximum allowed queued writes").
// saveDB now diffs against a per-collection last-saved snapshot and only writes
// changed/new/deleted records, debounced so bursts coalesce into one commit.
// Also covers 450-op chunking in saveCollection (Firestore batches cap at 500).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fs = vi.hoisted(() => {
  const state = {
    batches: [] as Array<{
      sets: Array<{ path: string; data: any }>;
      deletes: string[];
      commits: number;
    }>,
    setDocCalls: [] as Array<{ path: string; data: any }>,
    getDocsImpl: null as null | (() => Promise<any>),
    reset() {
      state.batches.length = 0;
      state.setDocCalls.length = 0;
      state.getDocsImpl = null;
    },
    allSets() {
      return state.batches.flatMap(b => b.sets);
    },
    allDeletes() {
      return state.batches.flatMap(b => b.deletes);
    },
    commitCount() {
      return state.batches.reduce((n, b) => n + b.commits, 0);
    },
  };
  return state;
});

const local = vi.hoisted(() => ({
  kvSet: vi.fn(async () => {}),
  kvGet: vi.fn(async () => null),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, name: string) => ({ name })),
  doc: vi.fn((_db: any, name: string, id: string) => ({ path: `${name}/${id}` })),
  getDocs: vi.fn(async () => {
    if (fs.getDocsImpl) {
      return fs.getDocsImpl();
    }
    return { empty: true, forEach: () => {} };
  }),
  setDoc: vi.fn(async (ref: any, data: any) => {
    fs.setDocCalls.push({ path: ref.path, data });
  }),
  deleteDoc: vi.fn(async () => {}),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  writeBatch: vi.fn(() => {
    const batch = {
      sets: [] as Array<{ path: string; data: any }>,
      deletes: [] as string[],
      commits: 0,
      set(ref: any, data: any) {
        batch.sets.push({ path: ref.path, data });
      },
      delete(ref: any) {
        batch.deletes.push(ref.path);
      },
      commit: async () => {
        batch.commits++;
      },
    };
    fs.batches.push(batch);
    return batch;
  }),
}));

vi.mock('../src/config/firebase.js', () => ({
  db: { __mockFirestore: true },
  isFirebaseConfigured: true,
}));

vi.mock('../src/core/local-store.js', () => ({
  kvGet: local.kvGet,
  kvSet: local.kvSet,
}));

import {
  saveDB,
  rebaselineSaved,
  flushPendingSaves,
  loadDB,
  _mergeRemoteSnapshot,
} from '../src/core/db.js';

const DB = () => (window as any).DB;

beforeEach(() => {
  fs.reset();
  local.kvSet.mockClear();
  local.kvGet.mockClear();
});

describe('saveDB() dirty-collection diffing (Firestore mode)', () => {
  it('writes only the records that changed since the last save', async () => {
    DB().customers = [
      { id: 'C1', name: 'Alpha' },
      { id: 'C2', name: 'Beta' },
    ];
    DB().salesOrders = [{ id: 'SO1', status: 'Open' }];
    rebaselineSaved();

    DB().customers[1].name = 'Beta (edited)';
    DB().salesOrders.push({ id: 'SO2', status: 'Open' });
    await saveDB();

    const paths = fs
      .allSets()
      .map(s => s.path)
      .sort();
    expect(paths).toEqual(['customers/C2', 'salesOrders/SO2']);
    // Unchanged records (C1, SO1) must NOT be rewritten — that's the quota bug.
    expect(paths).not.toContain('customers/C1');
    expect(fs.allDeletes()).toEqual([]);
  });

  it('commits nothing when nothing changed', async () => {
    rebaselineSaved();
    await saveDB();
    expect(fs.batches.length).toBe(0);
  });

  it('does not rewrite records already flushed by a previous save', async () => {
    DB().customers.push({ id: 'C3', name: 'Gamma' });
    await saveDB();
    expect(fs.allSets().map(s => s.path)).toEqual(['customers/C3']);

    fs.reset();
    await saveDB(); // no further edits
    expect(fs.batches.length).toBe(0);
  });

  it('deletes records that were removed locally', async () => {
    rebaselineSaved();
    DB().customers = DB().customers.filter((c: any) => c.id !== 'C2');
    await saveDB();

    expect(fs.allDeletes()).toEqual(['customers/C2']);
    expect(fs.allSets()).toEqual([]);
  });

  it('writes object collections as a single default doc when changed', async () => {
    DB().settings = { company: { name: 'Kelola' } };
    rebaselineSaved();

    DB().settings.company.name = 'Kelola 2';
    await saveDB();

    const sets = fs.allSets();
    expect(sets.length).toBe(1);
    expect(sets[0].path).toBe('settings/default');
    expect(sets[0].data.updatedAt).toBe('SERVER_TS');
  });

  it('coalesces a rapid burst of saveDB() calls into one commit', async () => {
    rebaselineSaved();
    DB().customers.push({ id: 'C10', name: 'Burst A' });
    const p1 = saveDB();
    DB().customers.push({ id: 'C11', name: 'Burst B' });
    const p2 = saveDB();
    const p3 = saveDB();
    await Promise.all([p1, p2, p3]);

    expect(fs.commitCount()).toBe(1);
    expect(
      fs
        .allSets()
        .map(s => s.path)
        .sort()
    ).toEqual(['customers/C10', 'customers/C11']);
  });

  it('chunks large dirty sets into ≤450-op batches', async () => {
    rebaselineSaved();
    DB().inventoryItems = Array.from({ length: 1000 }, (_, i) => ({
      id: `ITEM-${i}`,
      qty: i,
    }));
    await saveDB();

    expect(fs.commitCount()).toBe(3); // 450 + 450 + 100
    for (const b of fs.batches) {
      expect(b.sets.length + b.deletes.length).toBeLessThanOrEqual(450);
    }
    expect(fs.allSets().length).toBe(1000);
  });

  it('flushPendingSaves() runs a scheduled save immediately', async () => {
    rebaselineSaved();
    DB().customers.push({ id: 'C20', name: 'Unload' });
    const pending = saveDB(); // debounced — not yet committed
    expect(fs.commitCount()).toBe(0);
    await flushPendingSaves();
    await pending;
    expect(fs.allSets().map(s => s.path)).toContain('customers/C20');
  });
});

describe('saveDB(collectionName, data) explicit save', () => {
  it('chunks whole-array saves at 450 ops per batch (500-op Firestore cap)', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: `BIG-${i}` }));
    await saveDB('itemAdjustments', items);

    expect(fs.batches.length).toBe(3);
    expect(fs.batches.map(b => b.sets.length)).toEqual([450, 450, 100]);
    expect(fs.commitCount()).toBe(3);
  });

  it('saves object data via a single setDoc', async () => {
    await saveDB('settings', { tax: { ppnRate: 0.11 } });
    expect(fs.setDocCalls.length).toBe(1);
    expect(fs.setDocCalls[0].path).toBe('settings/default');
  });
});

describe('mergeRemoteSnapshot (concurrent-edit guard)', () => {
  it('remote wins for untouched docs, pending local edits survive', () => {
    DB().customers = [
      { id: 'M1', name: 'Old A' },
      { id: 'M2', name: 'Old B' },
    ];
    rebaselineSaved();
    DB().customers[0].name = 'Local edit'; // pending, un-flushed

    const conflicts = _mergeRemoteSnapshot('customers', [
      { id: 'M1', name: 'Old A' }, // unchanged remotely
      { id: 'M2', name: 'Remote edit' }, // changed remotely
      { id: 'M3', name: 'Remote new' },
    ]);

    const byId = Object.fromEntries(DB().customers.map((c: any) => [c.id, c.name]));
    expect(byId.M1).toBe('Local edit'); // pending edit kept
    expect(byId.M2).toBe('Remote edit'); // remote wins
    expect(byId.M3).toBe('Remote new');
    expect(conflicts).toBe(0); // M1 unchanged remotely → not a true conflict
  });

  it('counts true conflicts and still flushes the local edit afterwards', async () => {
    DB().customers = [{ id: 'X1', name: 'Base' }];
    rebaselineSaved();
    DB().customers[0].name = 'Mine';

    const conflicts = _mergeRemoteSnapshot('customers', [{ id: 'X1', name: 'Theirs' }]);
    expect(conflicts).toBe(1);
    expect(DB().customers[0].name).toBe('Mine'); // local wins in memory

    // The pending edit stays dirty against the remote baseline, so the next
    // flush writes it out (local-wins last-write, but no longer silent).
    await saveDB();
    expect(fs.allSets().map(s => s.path)).toContain('customers/X1');
  });

  it('keeps local deletions and resurrects docs deleted remotely mid-edit', () => {
    DB().customers = [
      { id: 'D1', name: 'DelMe' },
      { id: 'D2', name: 'EditMe' },
    ];
    rebaselineSaved();
    DB().customers = [{ id: 'D2', name: 'EditMe v2' }]; // D1 deleted, D2 edited locally

    _mergeRemoteSnapshot('customers', [{ id: 'D1', name: 'DelMe' }]); // D2 gone remotely
    const ids = DB().customers.map((c: any) => c.id);
    expect(ids).not.toContain('D1'); // local delete kept (flush deletes remotely)
    expect(ids).toContain('D2'); // local edit resurrected (flush re-creates)
  });
});

// Must run last: loadDB failure flips the module into local-first mode for the
// remainder of the file (usingLocalStore is module state).
describe('local-first fallback (usingLocalStore)', () => {
  it('mirrors to IndexedDB and never touches Firestore when offline', async () => {
    fs.getDocsImpl = () => Promise.reject(new Error('unavailable'));
    const ok = await loadDB();
    expect(ok).toBe(false);

    fs.reset();
    local.kvSet.mockClear();
    DB().customers = [{ id: 'C99', name: 'Offline' }];
    await saveDB();

    expect(local.kvSet).toHaveBeenCalled(); // mirrored to IndexedDB
    expect(fs.batches.length).toBe(0); // no Firestore writes
  });
});
