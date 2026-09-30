// ═══════════════════════════════════════════════════════════════════════════════
// KELOLA ERP (DEMO) — Backup Module (Firestore-based)
// Automatic backups to Firestore, manual export/import
// ═══════════════════════════════════════════════════════════════════════════════

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db as firestore } from '../config/firebase.js';
import { getCurrentUser, getAuthMode } from './auth.js';

const BACKUP_COLLECTION = 'backups';
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUPS = 10; // Keep last 10 backups

let backupTimer = null;

// Set once a cloud backup is rejected with permission-denied (a signed-in but
// role-less/`pending` Firebase user, by design of the Firestore rules). Stops
// the 24h timer from re-logging the same denial every cycle — one warning is
// enough; the data is still safe locally (local-first) and via file export.
let autoBackupDisabled = false;

// Cloud backups only work with a real Firebase Auth session. A local-fallback
// login (admin@kelola.example) or pure offline mode leaves getCurrentUser()
// truthy but request.auth null, so every Firestore write was rejected with
// permission-denied. Gate all cloud ops on the active auth backend instead of
// merely "is someone logged in". Local-first IndexedDB + file backup already
// protect the data in those modes.
function cloudBackupAvailable() {
  return getAuthMode() === 'firebase' && !!firestore;
}

/**
 * Initialize backup system
 */
export function initBackup() {
  // Check if auto-backup is due
  checkAndCreateBackup();

  // Set up periodic backup
  backupTimer = setInterval(checkAndCreateBackup, BACKUP_INTERVAL);

  // eslint-disable-next-line no-console
  console.log('✓ Backup system initialized');
}

/**
 * Check if backup is needed and create one
 */
async function checkAndCreateBackup() {
  // Skip silently in local/offline mode, or once a denial has disabled it.
  if (!cloudBackupAvailable() || autoBackupDisabled) {
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    return;
  }

  const lastBackup = localStorage.getItem('lastBackupTime');
  const now = Date.now();

  if (!lastBackup || now - parseInt(lastBackup) >= BACKUP_INTERVAL) {
    try {
      await createBackup();
      localStorage.setItem('lastBackupTime', String(now));
    } catch (error) {
      // Expected for a signed-in user without a cloud write role (`pending`):
      // warn once, then stop retrying instead of flooding the console.
      if (error?.code === 'permission-denied') {
        autoBackupDisabled = true;
        console.warn(
          'Auto-backup cloud dinonaktifkan: akun ini belum punya izin tulis (role belum ditetapkan admin). Data tetap aman secara lokal — gunakan Export ke file bila perlu.'
        );
        return;
      }
      console.error('Auto-backup failed:', error);
    }
  }
}

// Firestore caps a single document at 1 MiB. The whole-DB JSON is several MB,
// so a snapshot is split into string chunks stored in a subcollection
// (backups/<id>/chunks/<n>); the manifest document only holds metadata.
// 500k chars keeps each chunk well under the limit even with multibyte text.
const CHUNK_CHARS = 500000;

/**
 * Create a backup (chunked manifest + chunks subcollection).
 */
async function createBackup() {
  if (!cloudBackupAvailable()) {
    throw new Error(
      'Backup cloud hanya tersedia saat login cloud (Firebase). Gunakan Export ke file untuk mode lokal.'
    );
  }

  const user = getCurrentUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const json = JSON.stringify(DB);
  const size = new Blob([json]).size;
  const chunkCount = Math.max(1, Math.ceil(json.length / CHUNK_CHARS));

  const backupId = `backup_${Date.now()}`;
  for (let i = 0; i < chunkCount; i++) {
    await setDoc(doc(firestore, BACKUP_COLLECTION, backupId, 'chunks', String(i)), {
      data: json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS),
    });
  }

  // Manifest written LAST so a backup only becomes visible once all its
  // chunks exist (an interrupted upload leaves orphan chunks, never a
  // restorable-looking but corrupt backup).
  await setDoc(doc(firestore, BACKUP_COLLECTION, backupId), {
    userId: user.uid,
    timestamp: serverTimestamp(),
    size,
    chunks: chunkCount,
    version: DB._version || 1,
  });

  // Clean up old backups
  await cleanupOldBackups(user.uid);

  // eslint-disable-next-line no-console
  console.log(`✓ Backup created: ${backupId} (${chunkCount} chunks, ${formatBytes(size)})`);
  return backupId;
}

/**
 * Force create a backup now
 */
export async function forceBackup() {
  try {
    const backupId = await createBackup();
    localStorage.setItem('lastBackupTime', String(Date.now()));
    return backupId;
  } catch (error) {
    throw new Error('Gagal membuat backup: ' + error.message, { cause: error });
  }
}

/**
 * Clean up old backups (keep only MAX_BACKUPS)
 */
async function cleanupOldBackups(userId) {
  try {
    const q = query(collection(firestore, BACKUP_COLLECTION), orderBy('timestamp', 'desc'));

    const snapshot = await getDocs(q);
    const userBackups = [];

    snapshot.forEach(doc => {
      if (doc.data().userId === userId) {
        userBackups.push({ id: doc.id, ...doc.data() });
      }
    });

    // Delete old backups (chunks first, then the manifest)
    if (userBackups.length > MAX_BACKUPS) {
      const toDelete = userBackups.slice(MAX_BACKUPS);
      for (const backup of toDelete) {
        const chunkSnap = await getDocs(
          collection(firestore, BACKUP_COLLECTION, backup.id, 'chunks')
        );
        for (const chunkDoc of chunkSnap.docs) {
          await deleteDoc(chunkDoc.ref);
        }
        await deleteDoc(doc(firestore, BACKUP_COLLECTION, backup.id));
      }
      // eslint-disable-next-line no-console
      console.log(`✓ Cleaned up ${toDelete.length} old backups`);
    }
  } catch (error) {
    console.error('Failed to cleanup old backups:', error);
  }
}

/**
 * Get list of backups
 */
export async function getBackupList() {
  try {
    if (!cloudBackupAvailable()) {
      return [];
    }

    const user = getCurrentUser();
    if (!user) {
      return [];
    }

    const q = query(
      collection(firestore, BACKUP_COLLECTION),
      orderBy('timestamp', 'desc'),
      limit(MAX_BACKUPS)
    );

    const snapshot = await getDocs(q);
    const backups = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.userId === user.uid) {
        backups.push({
          key: doc.id,
          date: data.timestamp?.toDate().toLocaleString('id-ID') || 'Unknown',
          size: data.size,
          sizeFormatted: formatBytes(data.size),
        });
      }
    });

    return backups;
  } catch (error) {
    console.error('Failed to get backup list:', error);
    return [];
  }
}

/**
 * Restore from a backup
 */
export async function restoreFromBackup(backupId) {
  try {
    if (!cloudBackupAvailable()) {
      throw new Error(
        'Restore cloud hanya tersedia saat login cloud (Firebase). Gunakan Import dari file untuk mode lokal.'
      );
    }

    const docRef = doc(firestore, BACKUP_COLLECTION, backupId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Backup not found');
    }

    const backupData = docSnap.data();

    // Chunked format: reassemble from the chunks subcollection. Legacy
    // single-doc backups still carry the JSON inline in `data`.
    let json = backupData.data;
    if (!json && backupData.chunks) {
      const parts = [];
      for (let i = 0; i < backupData.chunks; i++) {
        const chunkSnap = await getDoc(
          doc(firestore, BACKUP_COLLECTION, backupId, 'chunks', String(i))
        );
        if (!chunkSnap.exists()) {
          throw new Error(`Backup corrupt: chunk ${i}/${backupData.chunks} hilang`);
        }
        parts.push(chunkSnap.data().data || '');
      }
      json = parts.join('');
    }
    if (!json) {
      throw new Error('Backup tidak berisi data');
    }
    const restoredDB = JSON.parse(json);

    // Update global DB
    Object.keys(restoredDB).forEach(key => {
      DB[key] = restoredDB[key];
    });

    // Save to Firestore
    await saveDB();

    // eslint-disable-next-line no-console
    console.log('✓ Backup restored:', backupId);
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw new Error('Gagal memulihkan backup: ' + error.message, { cause: error });
  }
}

/**
 * Export data to JSON file
 */
export function exportToFile() {
  try {
    const dataStr = JSON.stringify(DB, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `stone-erp-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return a.download;
  } catch (error) {
    throw new Error('Gagal export: ' + error.message, { cause: error });
  }
}

/**
 * Import data from JSON file
 */
export async function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async e => {
      try {
        const importedData = JSON.parse(e.target.result);

        // Validate data structure
        if (!importedData || typeof importedData !== 'object') {
          throw new Error('Invalid backup file format');
        }

        // Update global DB
        Object.keys(importedData).forEach(key => {
          DB[key] = importedData[key];
        });

        // Save to Firestore
        await saveDB();

        resolve();
      } catch (error) {
        reject(new Error('Gagal import: ' + error.message));
      }
    };

    reader.onerror = () => {
      reject(new Error('Gagal membaca file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Get backup status
 */
export function getBackupStatus() {
  const lastBackup = localStorage.getItem('lastBackupTime');

  if (!lastBackup) {
    return {
      lastBackup: false,
      lastBackupDate: null,
      hoursUntilNext: 24,
    };
  }

  const lastBackupTime = parseInt(lastBackup);
  const now = Date.now();
  const elapsed = now - lastBackupTime;
  const hoursUntilNext = Math.max(0, Math.ceil((BACKUP_INTERVAL - elapsed) / (60 * 60 * 1000)));

  return {
    lastBackup: true,
    lastBackupDate: new Date(lastBackupTime).toLocaleString('id-ID'),
    hoursUntilNext,
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (backupTimer) {
    clearInterval(backupTimer);
  }
});
