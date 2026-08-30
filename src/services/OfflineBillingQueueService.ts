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
import toast from 'react-hot-toast';

const OFFLINE_QUEUE_KEY = 'olive_pos_offline_bills';
let isSyncing = false;
let heartbeatInterval: any = null;
let autoSyncInterval: any = null;

export class OfflineBillingQueueService {
  /**
   * Reads pending offline bills from local storage.
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
   * Enqueues an offline-settled bill to the persistent queue.
   */
  public static enqueueOfflineBill(bill: POSCompletedBill): void {
    try {
      const queue = this.getOfflineQueue();
      const idempotencyKey = `offline_${bill.session?.terminalId || 'TERM'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      
      const enrichedBill = {
        ...bill,
        idempotencyKey,
        isOfflineBill: true,
        queuedAt: new Date().toISOString()
      };

      queue.push(enrichedBill);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      console.log(`📦 [OfflineQueue] Enqueued offline bill #${bill.billNumber}. Total in queue: ${queue.length}`);
    } catch (e) {
      console.error('Failed to write offline bill to storage:', e);
    }
  }

  /**
   * Synchronizes all queued offline bills to the canonical backend.
   */
  public static async syncQueue(): Promise<{ synced: number; remaining: number }> {
    if (isSyncing || !navigator.onLine) {
      return { synced: 0, remaining: this.getOfflineQueue().length };
    }

    const queue = this.getOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    isSyncing = true;
    try {
      console.log(`🔄 [OfflineQueue] Attempting to sync ${queue.length} offline bills to backend...`);
      const res = await fetchPOSApi('/api/pos/bills/sync-offline', {
        method: 'POST',
        body: JSON.stringify({ bills: queue })
      });

      if (res.ok) {
        const data = await res.json();
        console.log('✅ [OfflineQueue] Sync result:', data);
        
        // Clear local queue upon success
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        toast.success(`⚡ Reconnected: ${queue.length} offline bills synchronized!`, { id: 'offline-sync-success' });
        
        return { synced: queue.length, remaining: 0 };
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
    const isOnline = navigator.onLine;
    const pendingSyncCount = this.getOfflineQueue().length;

    try {
      await fetchPOSApi('/api/pos/health/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          terminalId: session?.terminalId || 'POS-TERM-01',
          branchId: session?.branchId || 'main_branch',
          franchiseId: session?.franchiseId || 'fra_primary',
          shiftId: session?.terminalId ? `shift_${session.terminalId}` : undefined,
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

    // 4. Online event listener
    window.addEventListener('online', () => {
      console.log('🌐 [OfflineBillingQueueService] Network connection restored! Triggering immediate sync...');
      this.sendHeartbeat();
      this.syncQueue();
      ThermalPrinterService.retryPendingPrints().catch(() => {});
    });

    window.addEventListener('offline', () => {
      console.warn('⚠️ [OfflineBillingQueueService] Network connection lost. Offline billing activated.');
      toast('⚠️ Offline Mode: Billing will continue locally and sync automatically when connection returns.', {
        id: 'offline-alert',
        duration: 4000
      });
    });
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
  }
}
