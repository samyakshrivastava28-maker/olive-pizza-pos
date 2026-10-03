/**
 * PosIndexedDbService.ts — Offline Persistent Storage Engine for Olive Pizza POS
 *
 * Provides resilient, non-blocking browser storage for:
 * 1. Branch-scoped Product Catalog Cache (ensuring cashiers can bill even completely offline or on browser restart)
 * 2. Per-bill Offline Transaction Queue (with idempotency keys, persistent sync states, and crash protection)
 */

import { POSProduct, POSCompletedBill } from '../types/pos';

const DB_NAME = 'OlivePizzaPOS_DB';
const DB_VERSION = 1;
const CATALOG_STORE = 'catalog_cache';
const BILLS_STORE = 'offline_bills';

export interface CachedCatalog {
  branchId: string;
  franchiseId: string;
  products: POSProduct[];
  cachedAt: string;
  version: number;
}

export interface OfflineBillRecord {
  idempotencyKey: string;
  billNumber: string;
  bill: POSCompletedBill;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
  lastError?: string;
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

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CATALOG_STORE)) {
          db.createObjectStore(CATALOG_STORE, { keyPath: 'branchId' });
        }
        if (!db.objectStoreNames.contains(BILLS_STORE)) {
          const billStore = db.createObjectStore(BILLS_STORE, { keyPath: 'idempotencyKey' });
          billStore.createIndex('status', 'status', { unique: false });
          billStore.createIndex('createdAt', 'createdAt', { unique: false });
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
  public static async getBranchCatalog(branchId: string): Promise<POSProduct[] | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(CATALOG_STORE, 'readonly');
      const store = tx.objectStore(CATALOG_STORE);

      return new Promise<POSProduct[] | null>((resolve) => {
        const req = store.get(branchId);
        req.onsuccess = () => {
          const res = req.result as CachedCatalog | undefined;
          resolve(res && Array.isArray(res.products) ? res.products : null);
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Enqueue an offline bill with idempotency key
   */
  public static async enqueueBill(bill: POSCompletedBill, idempotencyKey: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readwrite');
      const store = tx.objectStore(BILLS_STORE);

      const record: OfflineBillRecord = {
        idempotencyKey,
        billNumber: bill.billNumber || '',
        bill,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        retryCount: 0
      };

      await new Promise<void>((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('[PosIndexedDb] Failed to enqueue offline bill:', err);
    }
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
          resolve(all.filter((b) => b.status === 'PENDING'));
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  /**
   * Mark an offline bill as SYNCED
   */
  public static async markBillSynced(idempotencyKey: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(BILLS_STORE, 'readwrite');
      const store = tx.objectStore(BILLS_STORE);

      const req = store.get(idempotencyKey);
      req.onsuccess = () => {
        const rec = req.result as OfflineBillRecord | undefined;
        if (rec) {
          rec.status = 'SYNCED';
          rec.syncedAt = new Date().toISOString();
          store.put(rec);
        }
      };
    } catch (err) {
      console.warn('[PosIndexedDb] Failed to update bill sync status:', err);
    }
  }

  /**
   * Remove synced bills from storage
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
}
