/**
 * OfflineBillingQueueService.ts — POS Client Offline Queue & Telemetry Heartbeat Engine
 *
 * Provides:
 * - Local resilient offline queue for continuous cashier billing during internet disconnects
 * - Auto-reconnection background synchronizer with idempotency keys to prevent duplicate billing
 * - Periodic background telemetry heartbeats to notify canonical backend of terminal health
 * - Real-time sync status updates for UI
 */

import { fetchPOSApi } from '../lib/api';
import { POSCompletedBill } from '../types/pos';
import { usePOSStore } from '../store/posStore';
import { ThermalPrinterService } from './ThermalPrinterService';
import { PosIndexedDbService } from './PosIndexedDbService';
import toast from 'react-hot-toast';

const OFFLINE_QUEUE_KEY = 'olive_pos_offline_bills';
let isSyncing = false;
let heartbeatInterval: any = null;
let autoSyncInterval: any = null;
let onlineListener: (() => void) | null = null;
let offlineListener: (() => void) | null = null;

export class OfflineBillingQueueService {
  /**
   * Reads pending offline bills from local storage with IndexedDB fallback.
   */
  public static getOfflineQueue(): any[] {
    try {
      const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * Enqueues an offline-settled bill to persistent storage (both IndexedDB and LocalStorage fallback).
   * Ensures the pre-generated durable UUID idempotency key is preserved.
   */
  public static async enqueueOfflineBill(bill: POSCompletedBill): Promise<void> {
    try {
      const queue = this.getOfflineQueue();
      const idempotencyKey = bill.idempotencyKey || (bill as any).idempotencyKey || 
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `off_${bill.session?.terminalId || 'TERM'}_${bill.billNumber}_${Date.now()}`);
      
      const enrichedBill: POSCompletedBill = {
        ...bill,
        idempotencyKey,
        isOfflineBill: true,
        isProvisional: true,
        provisionalReceiptNo: bill.provisionalReceiptNo || bill.billNumber,
      };

      // Check if already in queue to prevent duplicate insertion
      const existingIdx = queue.findIndex((b: any) => b.idempotencyKey === idempotencyKey);
      if (existingIdx >= 0) {
        queue[existingIdx] = enrichedBill;
      } else {
        queue.push(enrichedBill);
      }

      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

      // Persist to robust IndexedDB store (await durability on disk!)
      // Surface storage errors to checkout rather than swallowing them
      await PosIndexedDbService.enqueueBill(enrichedBill, idempotencyKey);

      console.log(`📦 [OfflineQueue] Enqueued provisional offline bill #${enrichedBill.billNumber} (Key: ${idempotencyKey}). Queue count: ${queue.length}`);
    } catch (e) {
      console.error('Failed to write offline bill to storage:', e);
      throw e;
    }
  }

  /**
   * Synchronizes all queued offline bills to the canonical backend.
   * On completion, updates local IndexedDB records with the permanent_bill_no and notifies the cashier.
   */
  public static async syncQueue(): Promise<{ synced: number; remaining: number }> {
    if (isSyncing || !navigator.onLine) {
      return { synced: 0, remaining: this.getOfflineQueue().length };
    }

    // 1. Ensure IndexedDB pending records are fully unified with localStorage
    let queue = this.getOfflineQueue();
    const pendingIdb = await PosIndexedDbService.getPendingBills();
    if (pendingIdb.length > 0) {
      const queueKeys = new Set(queue.map((b: any) => b.idempotencyKey));
      for (const p of pendingIdb) {
        if (!queueKeys.has(p.idempotencyKey)) {
          queue.push({ ...p.bill, idempotencyKey: p.idempotencyKey });
          queueKeys.add(p.idempotencyKey);
        }
      }
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    }

    if (queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    isSyncing = true;
    try {
      console.log(`🔄 [OfflineQueue] Synchronizing ${queue.length} offline bills with canonical backend...`);
      const res = await fetchPOSApi('/api/pos/bills/sync-offline', {
        method: 'POST',
        body: JSON.stringify({ bills: queue })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('✅ [OfflineQueue] Sync result:', data);
        
        // Extract map of successfully acknowledged bills with permanentBillNo
        const acknowledgedMap = new Map<string, { permanentBillNo?: number; canonicalNumber?: string }>();
        if (Array.isArray(data.results)) {
          for (const item of data.results) {
            if (item.success || item.status === 'SYNCED' || item.status === 'ALREADY_SYNCED') {
              if (item.idempotencyKey) {
                acknowledgedMap.set(item.idempotencyKey, {
                  permanentBillNo: item.permanentBillNo,
                  canonicalNumber: item.permanentBillNo ? `#${item.permanentBillNo}` : item.billNumber
                });
              }
            }
          }
        } else {
          console.warn('⚠️ [OfflineQueue] Backend sync response did not provide results array; retaining queue for retry');
        }

        // Retain only unacknowledged / failed bills in localStorage queue
        const currentQueue = this.getOfflineQueue();
        const remainingQueue = currentQueue.filter((b: any) => !acknowledgedMap.has(b.idempotencyKey));
        if (remainingQueue.length === 0) {
          localStorage.removeItem(OFFLINE_QUEUE_KEY);
        } else {
          localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
        }

        // Mark individual confirmed bills as synced in IndexedDB and notify cashier
        for (const [key, details] of acknowledgedMap.entries()) {
          await PosIndexedDbService.markBillSynced(key, details.permanentBillNo, details.canonicalNumber);

          // Update active store lastCompletedBill if matching
          const currentLastBill = usePOSStore.getState().lastCompletedBill;
          if (currentLastBill && (currentLastBill.idempotencyKey === key || currentLastBill.orderId === key)) {
            usePOSStore.getState().setLastCompletedBill({
              ...currentLastBill,
              permanentBillNo: details.permanentBillNo || currentLastBill.permanentBillNo,
              billNumber: details.canonicalNumber || currentLastBill.billNumber,
              isProvisional: false,
              isOfflineBill: false
            });
          }
        }

        const syncedCount = acknowledgedMap.size;
        if (syncedCount > 0) {
          // Provide clear canonical permanent bill confirmation to cashier
          const confirmedDetails = Array.from(acknowledgedMap.values())
            .filter(d => d.permanentBillNo)
            .map(d => `#${d.permanentBillNo}`)
            .join(', ');

          const toastMsg = confirmedDetails 
            ? `⚡ Reconnected: ${syncedCount} offline bill(s) synced! Permanent Bill(s): ${confirmedDetails}`
            : `⚡ Reconnected: ${syncedCount} offline bill(s) synchronized!`;

          toast.success(toastMsg, { id: 'offline-sync-success', duration: 6000 });
        }
        if (remainingQueue.length > 0) {
          toast.error(`⚠️ ${remainingQueue.length} bills could not be synchronized yet. Will retry automatically.`, { id: 'offline-sync-partial' });
        }
        
        return { synced: syncedCount, remaining: remainingQueue.length };
      } else {
        console.warn('⚠️ [OfflineQueue] Sync endpoint returned non-OK status:', res.status);
      }
    } catch (err: any) {
      console.warn('⚠️ [OfflineQueue] Network error syncing offline queue:', err?.message);
    } finally {
      isSyncing = false;
    }

    return { synced: 0, remaining: this.getOfflineQueue().length };
  }

  /**
   * Dispatches a lightweight heartbeat to backend telemetry.
   */
  public static async sendHeartbeat(): Promise<void> {
    const session = usePOSStore.getState().session;
    if (!session?.terminalId || !session?.branchId || !session?.franchiseId) {
      return;
    }

    const isOnline = navigator.onLine;
    const pendingSyncCount = this.getOfflineQueue().length;

    try {
      await fetchPOSApi('/api/pos/health/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          terminalId: session.terminalId,
          branchId: session.branchId,
          franchiseId: session.franchiseId,
          shiftId: `shift_${session.terminalId}`,
          isOnline,
          pendingSyncCount,
          printerStatus: 'CONNECTED',
          appVersion: '2.4.0',
          clientTimestamp: new Date().toISOString()
        })
      });
    } catch {
      // Non-fatal telemetry ping failure
    }
  }

  /**
   * Starts background workers for heartbeat and automatic offline synchronization.
   */
  public static startBackgroundWorkers(): void {
    if (heartbeatInterval) return;

    console.log('🚀 [OfflineBillingQueueService] Starting heartbeat and auto-sync listeners...');

    // 1. Initial heartbeat & sync
    this.sendHeartbeat();
    this.syncQueue();

    // 2. Periodic Heartbeat every 45 seconds
    heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 45000);

    // 3. Periodic Auto-sync check every 20 seconds
    autoSyncInterval = setInterval(() => {
      if (navigator.onLine) {
        if (this.getOfflineQueue().length > 0) {
          this.syncQueue();
        }
        ThermalPrinterService.retryPendingPrints().catch(() => {});
      }
    }, 20000);

    // 4. Online and offline event listeners
    if (!onlineListener) {
      onlineListener = () => {
        console.log('🌐 [OfflineBillingQueueService] Network connection restored! Triggering immediate sync...');
        OfflineBillingQueueService.sendHeartbeat();
        OfflineBillingQueueService.syncQueue();
        ThermalPrinterService.retryPendingPrints().catch(() => {});
      };
      window.addEventListener('online', onlineListener);
    }

    if (!offlineListener) {
      offlineListener = () => {
        console.warn('⚠️ [OfflineBillingQueueService] Network connection lost. Offline billing activated.');
        toast('⚠️ Offline Mode: Billing will continue locally and sync automatically when connection returns.', {
          id: 'offline-alert',
          duration: 4000
        });
      };
      window.addEventListener('offline', offlineListener);
    }
  }

  public static stopBackgroundWorkers(): void {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
    if (onlineListener) {
      window.removeEventListener('online', onlineListener);
      onlineListener = null;
    }
    if (offlineListener) {
      window.removeEventListener('offline', offlineListener);
      offlineListener = null;
    }
  }
}
