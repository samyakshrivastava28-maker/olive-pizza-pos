import { useEffect, useCallback, useRef } from 'react';
import { usePOSStore } from '../store/posStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import toast from 'react-hot-toast';

export default function POSPushNotificationManager() {
  const { session } = usePOSStore();
  const isRegisteredRef = useRef(false);

  // 1. Token Registration on POS Session Active
  const registerToken = useCallback(async () => {
    if (isRegisteredRef.current || !session) return;
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await fetchApi('/api/notifications/token', {
          method: 'POST',
          body: JSON.stringify({
            token: `pos_desktop_${session.terminalId}_${session.branchId}`,
            platform: 'electron',
            browser: 'electron',
            deviceName: `POS Terminal (${session.terminalName || session.terminalId})`,
            appName: 'pos',
            branchId: session.branchId,
            terminalId: session.terminalId
          })
        });
        isRegisteredRef.current = true;
        return;
      }

      const perm = await NotificationPermissionManager.checkPermission();
      if (perm.state === 'GRANTED' && 'serviceWorker' in navigator) {
        const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
        const { app } = await import('../lib/firebase');
        const supported = await isSupported().catch(() => false);
        if (supported) {
          const messaging = getMessaging(app);
          const currentToken = await getToken(messaging, {
            vapidKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkGsZ_994Re362vMV24HgGpx0GuqTTAqwWRWtd9USQ'
          }).catch(() => null);

          if (currentToken) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: currentToken,
                platform: 'web',
                browser: navigator.userAgent,
                deviceName: `POS Web Terminal (${session.terminalId})`,
                appName: 'pos',
                branchId: session.branchId,
                terminalId: session.terminalId
              })
            });
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[POS PushManager] Registration warning:', err.message);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      registerToken();
    }
  }, [session, registerToken]);

  // 2. Realtime Listener for Online Orders Arriving at this POS Terminal's Branch
  useEffect(() => {
    if (!session || !session.branchId) return;

    const q = query(
      collection(db, 'orders'),
      where('branchId', '==', session.branchId),
      where('status', 'in', ['pending', 'accepted', 'preparing', 'ready'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          // Filter out orders that originated directly on this local POS terminal
          if (order.orderSource !== 'POS_BILLING' && order.orderSource !== 'POS_DINE_IN' && order.orderSource !== 'POS_TAKEAWAY') {
            const eventId = `pos_order:${order.id}:${order.version || 1}`;
            if (NotificationDeduplicator.shouldProcess(eventId)) {
              SoundAlertEngine.playSound('new_online_order');

              toast(`🍕 Online Order #${order.dailyOrderNumber || order.orderNumber || order.id.slice(-6).toUpperCase()} received!`, {
                icon: '🔔',
                duration: 5000,
                style: {
                  background: '#0F172A',
                  color: '#38BDF8',
                  border: '1px solid #0284C7'
                }
              });

              if (typeof window !== 'undefined' && (window as any).electronAPI?.showNativeNotification) {
                (window as any).electronAPI.showNativeNotification({
                  title: `Online Order #${order.dailyOrderNumber || order.orderNumber || order.id.slice(-6).toUpperCase()}`,
                  body: `₹${order.finalTotal || order.totalAmount} • ${order.paymentMethod || 'COD'}`,
                  orderId: order.id
                });
              }
            }
          }
        }
      });
    }, (err) => {
      console.warn('[POS PushManager] Realtime listener error:', err);
    });

    return () => unsubscribe();
  }, [session]);

  return null;
}
