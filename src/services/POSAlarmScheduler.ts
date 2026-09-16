import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { deviceAlarmService } from './DeviceAlarmService';

export class POSAlarmScheduler {
  private static instance: POSAlarmScheduler;
  private unacknowledgedOrderIds: Set<string> = new Set();
  private acknowledgedOrderIds: Set<string> = new Set();
  private timer: any = null;
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Listen for tab/window visibility changes: sound loop MUST be foreground-only!
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.evaluateLoop();
        } else {
          this.stopLoop();
        }
      });
      window.addEventListener('blur', () => {
        // Optional safety: ensure loop stops if window loses focus completely
      });
      window.addEventListener('focus', () => {
        this.evaluateLoop();
      });
    }

    // React to device alarm toggle changes
    deviceAlarmService.subscribe((enabled) => {
      if (!enabled) {
        this.stopLoop();
      } else {
        this.evaluateLoop();
      }
    });
  }

  public static getInstance(): POSAlarmScheduler {
    if (!POSAlarmScheduler.instance) {
      POSAlarmScheduler.instance = new POSAlarmScheduler();
    }
    return POSAlarmScheduler.instance;
  }

  /**
   * Sync active orders from Firestore snapshot or polling.
   * Identifies unacknowledged new orders and triggers repeating 5s alarm.
   */
  public syncIncomingOrders(orders: Array<{ id: string; status?: string; orderSource?: string }>): void {
    const activeIds = new Set<string>();

    for (const ord of orders) {
      const isOnline = ord.orderSource === 'CUSTOMER_APP' || ord.orderSource === 'ONLINE' || !ord.orderSource;
      const isActionable = ['CONFIRMED', 'PENDING', 'ACCEPTED', 'KITCHEN', 'PREPARING'].includes((ord.status || '').toUpperCase());

      if (isOnline && isActionable) {
        activeIds.add(ord.id);
        if (!this.acknowledgedOrderIds.has(ord.id)) {
          this.unacknowledgedOrderIds.add(ord.id);
        }
      }
    }

    // Clean up orders that are completed/cancelled
    for (const id of Array.from(this.unacknowledgedOrderIds)) {
      if (!activeIds.has(id)) {
        this.unacknowledgedOrderIds.delete(id);
      }
    }

    this.notifyListeners();
    this.evaluateLoop();
  }

  /**
   * Cashier clicks "Acknowledge" on an order.
   * Stops the repeating 5-second alarm sound for this order, without changing authoritative order status.
   */
  public acknowledgeOrder(orderId: string): void {
    this.acknowledgedOrderIds.add(orderId);
    this.unacknowledgedOrderIds.delete(orderId);
    this.notifyListeners();
    this.evaluateLoop();
  }

  /**
   * Acknowledge all currently ringing orders.
   */
  public acknowledgeAll(): void {
    for (const id of Array.from(this.unacknowledgedOrderIds)) {
      this.acknowledgedOrderIds.add(id);
    }
    this.unacknowledgedOrderIds.clear();
    this.notifyListeners();
    this.evaluateLoop();
  }

  public isOrderAcknowledged(orderId: string): boolean {
    return this.acknowledgedOrderIds.has(orderId);
  }

  public getUnacknowledgedCount(): number {
    return this.unacknowledgedOrderIds.size;
  }

  public getUnacknowledgedOrderIds(): string[] {
    return Array.from(this.unacknowledgedOrderIds);
  }

  public isAlarmRunning(): boolean {
    return this.timer !== null;
  }

  private evaluateLoop(): void {
    const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
    const alarmEnabled = deviceAlarmService.isAlarmEnabled();
    const hasUnackOrders = this.unacknowledgedOrderIds.size > 0;

    if (isVisible && alarmEnabled && hasUnackOrders) {
      if (!this.timer) {
        // Play immediately on first trigger
        this.triggerChime();
        // Repeat every 5 seconds until acknowledged or handled
        this.timer = setInterval(() => {
          this.triggerChime();
        }, 5000);
      }
    } else {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private triggerChime(): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      this.stopLoop();
      return;
    }
    if (!deviceAlarmService.isAlarmEnabled() || this.unacknowledgedOrderIds.size === 0) {
      this.stopLoop();
      return;
    }

    try {
      SoundAlertEngine.playSound('new_online_order');
    } catch (err) {
      console.warn('[POSAlarmScheduler] Chime error:', err);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch {}
    }
  }
}

export const posAlarmScheduler = POSAlarmScheduler.getInstance();
