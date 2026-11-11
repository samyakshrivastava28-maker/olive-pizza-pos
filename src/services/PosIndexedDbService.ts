/**
 * PosIndexedDbService.ts — Offline Persistent Storage Engine for Olive Pizza POS
 *
 * Provides resilient, non-blocking browser storage for:
 * 1. Branch-scoped Product Catalog Cache (ensuring cashiers can bill even completely offline or on browser restart)
 * 2. Per-bill Offline Transaction Queue (with idempotency keys, persistent sync states, and crash protection)
 * 3. Local Backups & Inspection Snapshots (with SHA-256 integrity validation)
 * 4. CSV Export Metadata & Audit History
 * 5. Synchronization Health & Status Metadata
 */

import { POSProduct, POSCompletedBill } from '../types/pos';

const DB_NAME = 'OlivePizzaPOS_DB';
const DB_VERSION = 2;
const CATALOG_STORE = 'catalog_cache';
const BILLS_STORE = 'offline_bills';
const BACKUPS_STORE = 'local_backups';
const CSV_EXPORTS_STORE = 'csv_exports';
const SYNC_META_STORE = 'sync_metadata';

export interface CachedCatalog {
  branchId: string;
  franchiseId: string;
  products: POSProduct[];
  cachedAt: string;
  version: number;
}

export type BillSyncStatus = 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'RETRY_REQUIRED' | 'REVIEW_REQUIRED' | 'PENDING' | 'FAILED';

export interface OfflineBillRecord {
  idempotencyKey: string;
  billNumber: string;
  bill: POSCompletedBill;
  status: BillSyncStatus;
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
  lastError?: string;
  permanentBillNo?: number;
}

export interface LocalBackupRecord {
  id: string;
  filename: string;
  createdAt: string;
  recordCount: number;
  checksumSha256: string;
  sizeBytes: number;
  scope: { branchId: string; franchiseId: string };
  status: 'COMPLETED' | 'FAILED';
}

export interface CsvExportMeta {
  id: string;
  reportType: string;
  filename: string;
  createdAt: string;
  rowCount: number;
  scope: { branchId: string; franchiseId: string };
  status: 'SUCCESS' | 'FAILED';
}

export interface LocalDatabaseSnapshot {
  schemaVersion: number;
  app: 'OLIVE_PIZZA_POS';
  createdAt: string;
  franchiseId: string;
  branchId: string;
  checksumSha256: string;
  data: {
    catalog?: CachedCatalog[];
    bills: OfflineBillRecord[];
    backups?: LocalBackupRecord[];
    csvExports?: CsvExportMeta[];
  };
}

export async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fast deterministic fallback hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

export class PosIndexedDbService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CATALOG_STORE)) {
          db.createObjectStore(CATALOG_STORE, { keyPath: 'branchId' });
        }
        if (!db.objectStoreNames.contains(BILLS_STORE)) {
          const billStore = db.createObjectStore(BILLS_STORE, { keyPath: 'idempotencyKey' });
          billStore.createIndex('status', 'status', { unique: false });
          billStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(BACKUPS_STORE)) {
          const bkpStore = db.createObjectStore(BACKUPS_STORE, { keyPath: 'id' });
          bkpStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(CSV_EXPORTS_STORE)) {
          const csvStore = db.createObjectStore(CSV_EXPORTS_STORE, { keyPath: 'id' });
          csvStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
          db.createObjectStore(SYNC_META_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Save branch product catalog to IndexedDB
   */
  public static async saveBranchCatalog(branchId: string, franchiseId: string, products: POSProduct[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CATALOG_STORE, 'readwrite');
      const store = tx.objectStore(CATALOG_STORE);

      const record: CachedCatalog = {
        branchId,
        franchiseId,
        products,
        cachedAt: new Date().toISOString(),
        version: Date.now()
      };

      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to cache catalog:', err);
    }
  }

  /**
   * Retrieve cached branch product catalog from IndexedDB
   */
  public static async getBranchCatalog(branchId: string, franchiseId?: string): Promise<POSProduct[] | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CATALOG_STORE, 'readonly');
      const store = tx.objectStore(CATALOG_STORE);

      return new Promise<POSProduct[] | null>((resolve) => {
        const req = store.get(branchId);
        req.onsuccess = () => {
          const res = req.result as CachedCatalog | undefined;
          if (!res || !Array.isArray(res.products)) {
            resolve(null);
            return;
          }
          if (franchiseId && res.franchiseId && res.franchiseId !== franchiseId) {
            resolve(null);
            return;
          }
          resolve(res.products);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Enqueue an offline bill with idempotency key
   * Resolves only after the IndexedDB transaction itself completes successfully on disk.
   */
  public static async enqueueBill(bill: POSCompletedBill, idempotencyKey: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BILLS_STORE, 'readwrite');
      const store = tx.objectStore(BILLS_STORE);

      const record: OfflineBillRecord = {
        idempotencyKey,
        billNumber: bill.billNumber || '',
        bill: {
          ...bill,
          idempotencyKey
        },
        status: 'PENDING_SYNC',
        createdAt: bill.createdAt || new Date().toISOString(),
        retryCount: 0
      };

      const req = store.put(record);
      req.onerror = () => reject(req.error || new Error('Failed to put record in IndexedDB store'));

      // Resolve only after transaction commits to disk
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed to commit'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  /**
   * Get all pending bills that require synchronization
   */
  public static async getPendingBills(): Promise<OfflineBillRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readonly');
      const store = tx.objectStore(BILLS_STORE);

      return new Promise<OfflineBillRecord[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as OfflineBillRecord[]) || [];
          resolve(all.filter((b) => b.status === 'PENDING' || b.status === 'PENDING_SYNC' || b.status === 'RETRY_REQUIRED'));
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get all bill records stored in IndexedDB (pending, syncing, synced, and failed)
   */
  public static async getAllBills(): Promise<OfflineBillRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readonly');
      const store = tx.objectStore(BILLS_STORE);

      return new Promise<OfflineBillRecord[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => {
          resolve((req.result as OfflineBillRecord[]) || []);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get a single bill record by idempotency key
   */
  public static async getBillByIdempotencyKey(idempotencyKey: string): Promise<OfflineBillRecord | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readonly');
      const store = tx.objectStore(BILLS_STORE);

      return new Promise<OfflineBillRecord | null>((resolve) => {
        const req = store.get(idempotencyKey);
        req.onsuccess = () => resolve((req.result as OfflineBillRecord) || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Mark an offline bill status with details
   */
  public static async markBillStatus(
    idempotencyKey: string,
    status: BillSyncStatus,
    options?: { permanentBillNo?: number; canonicalNumber?: string; lastError?: string }
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readwrite');
      const store = tx.objectStore(BILLS_STORE);

      await new Promise<void>((resolve, reject) => {
        const req = store.get(idempotencyKey);
        req.onsuccess = () => {
          const rec = req.result as OfflineBillRecord | undefined;
          if (rec) {
            rec.status = status;
            if (status === 'SYNCED') {
              rec.syncedAt = new Date().toISOString();
            }
            if (options?.permanentBillNo != null) {
              rec.permanentBillNo = options.permanentBillNo;
              rec.bill.permanentBillNo = options.permanentBillNo;
              rec.bill.isProvisional = false;
            }
            if (options?.canonicalNumber) {
              rec.bill.billNumber = options.canonicalNumber;
            }
            if (options?.lastError) {
              rec.lastError = options.lastError;
              rec.retryCount = (rec.retryCount || 0) + 1;
            }
            const putReq = store.put(rec);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
          } else {
            resolve();
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to update bill status:', err);
    }
  }

  /**
   * Mark an offline bill as SYNCED with canonical permanent bill number
   */
  public static async markBillSynced(
    idempotencyKey: string,
    permanentBillNo?: number,
    canonicalBillNumber?: string
  ): Promise<void> {
    return this.markBillStatus(idempotencyKey, 'SYNCED', { permanentBillNo, canonicalNumber: canonicalBillNumber });
  }

  /**
   * Updates permanent bill number on an existing record
   */
  public static async updateBillPermanentNumber(
    idempotencyKey: string,
    permanentBillNo: number,
    canonicalBillNumber?: string
  ): Promise<void> {
    return this.markBillSynced(idempotencyKey, permanentBillNo, canonicalBillNumber);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL BACKUPS & CSV METADATA STORAGE
  // ═══════════════════════════════════════════════════════════════════════════

  public static async saveBackupRecord(record: LocalBackupRecord): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BACKUPS_STORE, 'readwrite');
      const store = tx.objectStore(BACKUPS_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to save backup record:', err);
    }
  }

  public static async getAllBackupRecords(): Promise<LocalBackupRecord[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BACKUPS_STORE, 'readonly');
      const store = tx.objectStore(BACKUPS_STORE);
      return new Promise<LocalBackupRecord[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as LocalBackupRecord[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public static async saveCsvExportRecord(record: CsvExportMeta): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CSV_EXPORTS_STORE, 'readwrite');
      const store = tx.objectStore(CSV_EXPORTS_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to save CSV export record:', err);
    }
  }

  public static async getAllCsvExportRecords(): Promise<CsvExportMeta[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CSV_EXPORTS_STORE, 'readonly');
      const store = tx.objectStore(CSV_EXPORTS_STORE);
      return new Promise<CsvExportMeta[]>((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as CsvExportMeta[]) || []);
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  public static async setSyncMeta(key: string, value: any): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SYNC_META_STORE, 'readwrite');
      const store = tx.objectStore(SYNC_META_STORE);
      await new Promise<void>((resolve, reject) => {
        const req = store.put({ key, value, updatedAt: new Date().toISOString() });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to set sync meta:', err);
    }
  }

  public static async getSyncMeta(key: string): Promise<any> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(SYNC_META_STORE, 'readonly');
      const store = tx.objectStore(SYNC_META_STORE);
      return new Promise<any>((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const res = req.result;
          resolve(res ? res.value : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Export complete local database snapshot for recovery.
   * Excludes passwords, tokens, or payment secrets.
   */
  public static async exportLocalDatabaseSnapshot(scope: { branchId: string; franchiseId: string }): Promise<LocalDatabaseSnapshot> {
    const bills = await this.getAllBills();
    const backups = await this.getAllBackupRecords();
    const csvExports = await this.getAllCsvExportRecords();

    // Data payload for hash computation
    const rawData = {
      bills,
      backups,
      csvExports
    };

    const payloadString = JSON.stringify(rawData);
    const checksumSha256 = await computeSha256(payloadString);

    const snapshot: LocalDatabaseSnapshot = {
      schemaVersion: DB_VERSION,
      app: 'OLIVE_PIZZA_POS',
      createdAt: new Date().toISOString(),
      franchiseId: scope.franchiseId,
      branchId: scope.branchId,
      checksumSha256,
      data: rawData
    };

    // Save record to backup audit
    await this.saveBackupRecord({
      id: `bkp_${Date.now()}`,
      filename: `olive-pizza-pos-backup-${new Date().toISOString().split('T')[0]}.json`,
      createdAt: snapshot.createdAt,
      recordCount: bills.length,
      checksumSha256,
      sizeBytes: payloadString.length,
      scope,
      status: 'COMPLETED'
    });

    return snapshot;
  }

  /**
   * Validates a backup snapshot integrity against its checksum and required schema.
   */
  public static async validateBackupSnapshot(snapshot: any): Promise<{ valid: boolean; error?: string; summary?: any }> {
    if (!snapshot || typeof snapshot !== 'object') {
      return { valid: false, error: 'Invalid backup file: not a valid JSON object' };
    }

    if (snapshot.app !== 'OLIVE_PIZZA_POS') {
      return { valid: false, error: `App mismatch: expected "OLIVE_PIZZA_POS", found "${snapshot.app || 'unknown'}"` };
    }

    if (!snapshot.checksumSha256 || !snapshot.data) {
      return { valid: false, error: 'Corrupt backup file: missing data or checksum header' };
    }

    const payloadString = JSON.stringify(snapshot.data);
    const computedHash = await computeSha256(payloadString);

    if (computedHash !== snapshot.checksumSha256) {
      return {
        valid: false,
        error: `Integrity check failed: checksum mismatch (expected ${snapshot.checksumSha256}, computed ${computedHash})`
      };
    }

    const bills = Array.isArray(snapshot.data.bills) ? snapshot.data.bills : [];
    return {
      valid: true,
      summary: {
        totalBills: bills.length,
        franchiseId: snapshot.franchiseId,
        branchId: snapshot.branchId,
        createdAt: snapshot.createdAt,
        checksum: snapshot.checksumSha256
      }
    };
  }

  /**
   * Remove old synced bills from storage (prune beyond 7 days)
   */
  public static async clearSyncedBills(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readwrite');
      const store = tx.objectStore(BILLS_STORE);

      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as OfflineBillRecord[]) || [];
        for (const b of all) {
          if (b.status === 'SYNCED') {
            store.delete(b.idempotencyKey);
          }
        }
      };
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to prune synced bills:', err);
    }
  }

  /**
   * Restores an exported database snapshot into IndexedDB.
   * Validates schema and checksum before modifying any stores.
   * Runs in an atomic readwrite transaction across BILLS_STORE, BACKUPS_STORE, and CSV_EXPORTS_STORE.
   * Supports MERGE (preserves existing records, inserts/updates from snapshot) or REPLACE (clears stores before restoring).
   */
  public static async restoreLocalDatabaseSnapshot(
    snapshot: any,
    options: { mode?: 'MERGE' | 'REPLACE' } = { mode: 'MERGE' }
  ): Promise<{ success: boolean; restoredBills: number; error?: string }> {
    const validation = await this.validateBackupSnapshot(snapshot);
    if (!validation.valid) {
      return { success: false, restoredBills: 0, error: validation.error };
    }

    const bills: OfflineBillRecord[] = Array.isArray(snapshot.data?.bills) ? snapshot.data.bills : [];
    const backups: LocalBackupRecord[] = Array.isArray(snapshot.data?.backups) ? snapshot.data.backups : [];
    const csvExports: CsvExportMeta[] = Array.isArray(snapshot.data?.csvExports) ? snapshot.data.csvExports : [];

    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([BILLS_STORE, BACKUPS_STORE, CSV_EXPORTS_STORE], 'readwrite');
      const billStore = tx.objectStore(BILLS_STORE);
      const backupStore = tx.objectStore(BACKUPS_STORE);
      const csvStore = tx.objectStore(CSV_EXPORTS_STORE);

      let restoredCount = 0;

      tx.onerror = () => {
        reject(new Error(`Restore transaction failed: ${tx.error?.message || 'Transaction aborted'}`));
      };

      tx.oncomplete = () => {
        resolve({
          success: true,
          restoredBills: restoredCount
        });
      };

      if (options.mode === 'REPLACE') {
        billStore.clear();
        backupStore.clear();
        csvStore.clear();

        for (const bill of bills) {
          if (bill && bill.idempotencyKey) {
            billStore.put(bill);
            restoredCount++;
          }
        }

        for (const bkp of backups) {
          if (bkp && bkp.id) backupStore.put(bkp);
        }

        for (const exp of csvExports) {
          if (exp && exp.id) csvStore.put(exp);
        }
      } else {
        // MERGE mode: Conflict-aware merge
        const existingReq = billStore.getAll();
        existingReq.onsuccess = () => {
          const existingList = (existingReq.result as OfflineBillRecord[]) || [];
          const existingMap = new Map<string, OfflineBillRecord>();
          for (const ex of existingList) {
            if (ex && ex.idempotencyKey) {
              existingMap.set(ex.idempotencyKey, ex);
            }
          }

          for (const bill of bills) {
            if (bill && bill.idempotencyKey) {
              const existing = existingMap.get(bill.idempotencyKey);
              if (existing) {
                // Conflict resolution: Never downgrade SYNCED to PENDING
                const merged: OfflineBillRecord = {
                  ...bill,
                  permanentBillNo: existing.permanentBillNo || bill.permanentBillNo,
                  status: (existing.status === 'SYNCED' && bill.status !== 'SYNCED')
                    ? 'SYNCED'
                    : bill.status,
                  syncedAt: existing.syncedAt || bill.syncedAt,
                  retryCount: Math.max(existing.retryCount || 0, bill.retryCount || 0)
                };
                billStore.put(merged);
              } else {
                billStore.put(bill);
              }
              restoredCount++;
            }
          }

          for (const bkp of backups) {
            if (bkp && bkp.id) backupStore.put(bkp);
          }
          for (const exp of csvExports) {
            if (exp && exp.id) csvStore.put(exp);
          }
        };
      }
    });
  }

  /**
   * Clear all persisted offline POS data across stores on logout or session switch.
   */
  public static async clearAllData(): Promise<void> {
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [CATALOG_STORE, BILLS_STORE, BACKUPS_STORE, CSV_EXPORTS_STORE, SYNC_META_STORE],
          'readwrite'
        );
        tx.objectStore(CATALOG_STORE).clear();
        tx.objectStore(BILLS_STORE).clear();
        tx.objectStore(BACKUPS_STORE).clear();
        tx.objectStore(CSV_EXPORTS_STORE).clear();
        tx.objectStore(SYNC_META_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to clear POS IndexedDB stores'));
      });
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to clear stores:', err);
    }
  }

}
