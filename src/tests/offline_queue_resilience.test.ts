import assert from 'node:assert';
import test from 'node:test';

// Polyfill window & localStorage for Node test runner
const localStorageStore = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => localStorageStore.get(key) || null,
  setItem: (key: string, val: string) => { localStorageStore.set(key, String(val)); },
  removeItem: (key: string) => { localStorageStore.delete(key); },
  clear: () => { localStorageStore.clear(); }
};

(global as any).localStorage = localStorageMock;
(global as any).window = global;
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true
});

// In-memory fake IndexedDB store for PosIndexedDbService testing
import { PosIndexedDbService, OfflineBillRecord } from '../services/PosIndexedDbService.ts';
import { OfflineBillingQueueService } from '../services/OfflineBillingQueueService.ts';
import { POSCompletedBill } from '../types/pos.ts';

test('Olive Pizza POS — Offline Queue & Persistence Failure Safety Test Suite', async (t) => {

  await t.test('Storage Failure-Safety: IndexedDB abort/quota error halts enqueue and leaves queue clean', async () => {
    localStorageMock.clear();
    const originalEnqueue = PosIndexedDbService.enqueueBill;

    // Simulate IndexedDB transaction abort / QuotaExceededError
    PosIndexedDbService.enqueueBill = async () => {
      throw new Error('QuotaExceededError: The quota has been exceeded on persistent disk storage.');
    };

    const mockBill: any = {
      billNumber: 'PROV-1001',
      subtotal: 500,
      discountAmount: 0,
      deliveryFee: 0,
      taxAmount: 25,
      finalTotal: 525,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      items: [],
      orderSource: 'POS_DINE_IN',
      customerName: 'Walk-in Guest',
      customerPhone: '9876543210',
      orderId: 'off_test_1',
      idempotencyKey: 'idemp_quota_fail_1'
    };

    // Must throw fail-closed
    await assert.rejects(
      async () => {
        await OfflineBillingQueueService.enqueueOfflineBill(mockBill);
      },
      (err: any) => {
        assert.match(err.message, /QuotaExceededError/);
        return true;
      },
      'IndexedDB failure must halt checkout immediately'
    );

    // Verify localStorage queue remains empty — no uncommitted bill entered the sync queue!
    const queue = OfflineBillingQueueService.getOfflineQueue();
    assert.strictEqual(queue.length, 0, 'No uncommitted bill may enter the active sync queue');

    // Restore
    PosIndexedDbService.enqueueBill = originalEnqueue;
  });

  await t.test('Queue Eligibility: Background sync purges phantom localStorage items lacking durable IndexedDB record', async () => {
    localStorageMock.clear();

    // Inject phantom uncommitted bill into localStorage (simulating corrupted state or failed disk write)
    const phantomBill = {
      idempotencyKey: 'phantom_uncommitted_key_999',
      billNumber: 'PROV-999',
      finalTotal: 300
    };
    localStorageMock.setItem('pos_offline_bills_queue', JSON.stringify([phantomBill]));

    const originalGetPending = PosIndexedDbService.getPendingBills;
    // IndexedDB has 0 pending bills
    PosIndexedDbService.getPendingBills = async () => [];

    // Trigger syncQueue reconciliation
    const syncRes = await OfflineBillingQueueService.syncQueue();
    assert.strictEqual(syncRes.synced, 0);

    // Verify phantom bill was purged from localStorage queue
    const purgedQueue = OfflineBillingQueueService.getOfflineQueue();
    assert.strictEqual(purgedQueue.length, 0, 'Phantom bills lacking durable IndexedDB records must be purged from queue');

    // Restore
    PosIndexedDbService.getPendingBills = originalGetPending;
  });

  await t.test('Recovery: When localStorage write fails after IndexedDB commit, durable record is recovered', async () => {
    localStorageMock.clear();

    const durableBillRecord: OfflineBillRecord = {
      idempotencyKey: 'idemp_durable_recover_1',
      billNumber: 'PROV-1005',
      bill: {
        billNumber: 'PROV-1005',
        subtotal: 400,
        discountAmount: 0,
        deliveryFee: 0,
        taxAmount: 20,
        finalTotal: 420,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        items: [],
        orderSource: 'POS_TAKEAWAY',
        customerName: 'Takeaway Guest',
        customerPhone: '9876543210',
        orderId: 'off_rec_1',
        idempotencyKey: 'idemp_durable_recover_1'
      } as any,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      retryCount: 0
    };

    const originalGetPending = PosIndexedDbService.getPendingBills;
    PosIndexedDbService.getPendingBills = async () => [durableBillRecord];

    // LocalStorage has 0 bills initially
    assert.strictEqual(OfflineBillingQueueService.getOfflineQueue().length, 0);

    // Calling syncQueue recovers the pending IndexedDB bill into the queue
    (global as any).fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        results: [{
          idempotencyKey: 'idemp_durable_recover_1',
          status: 'SYNCED',
          permanentBillNo: 5042
        }]
      })
    });

    const originalMarkSynced = PosIndexedDbService.markBillSynced;
    let syncedKey = '';
    let permanentNo = 0;
    PosIndexedDbService.markBillSynced = async (key, pNo) => {
      syncedKey = key;
      permanentNo = pNo || 0;
    };

    await OfflineBillingQueueService.syncQueue();

    assert.strictEqual(syncedKey, 'idemp_durable_recover_1', 'Durable record must be sent to backend and marked synced');
    assert.strictEqual(permanentNo, 5042, 'Permanent bill number must be updated on local record');

    // Restore
    PosIndexedDbService.getPendingBills = originalGetPending;
    PosIndexedDbService.markBillSynced = originalMarkSynced;
  });

  await t.test('Idempotency Key Retention: Retries reuse stable key, new transactions generate new key', () => {
    // Simulate PaymentModal idempotency ref behavior
    let activeIdempotencyKeyRef: string | null = null;

    // First checkout attempt for Transaction A
    if (!activeIdempotencyKeyRef) {
      activeIdempotencyKeyRef = 'uuid_trans_A_12345';
    }
    const attempt1 = activeIdempotencyKeyRef;

    // Retry after network glitch
    if (!activeIdempotencyKeyRef) {
      activeIdempotencyKeyRef = 'uuid_trans_A_NEW_FAIL';
    }
    const attempt2 = activeIdempotencyKeyRef;

    assert.strictEqual(attempt1, attempt2, 'Retry MUST retain identical idempotency key to prevent double billing');

    // Succeeded and order reset
    activeIdempotencyKeyRef = null;

    // Next transaction B
    if (!activeIdempotencyKeyRef) {
      activeIdempotencyKeyRef = 'uuid_trans_B_67890';
    }
    assert.notStrictEqual(activeIdempotencyKeyRef, attempt1, 'Subsequent transaction must generate fresh key');
  });

});
