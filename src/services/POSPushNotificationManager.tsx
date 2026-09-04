import { useEffect, useState, useCallback, useRef } from 'react';
import { usePOSStore } from '../store/posStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export default function POSPushNotificationManager() {
  const { session, user, activeBranchId } = usePOSStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const isRegisteredRef = useRef(false);

  // 1. Create Native Notification Channels on Android / iOS
  const createChannels = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await PushNotifications.createChannel({
        id: 'olive_order_new',
        name: 'New Orders',
        description: 'Instant notification for incoming online orders.',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'order_alert',
      });
      await PushNotifications.createChannel({
        id: 'olive_system',
        name: 'System Alerts',
        description: 'System announcements and operational alerts.',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'system_alert',
      });
    } catch (e) {
      console.warn('[POS PushManager] Channel creation notice:', e);
    }
  }, []);

  // 2. Token Registration across Platforms
  const registerToken = useCallback(async () => {
    if (isRegisteredRef.current) return;
    const branchId = session?.branchId || activeBranchId || 'main_branch';
    const terminalId = session?.terminalId || 'terminal_main';

    try {
      // Electron Desktop App
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await fetchApi('/api/notifications/token', {
          method: 'POST',
          body: JSON.stringify({
            token: `pos_desktop_${terminalId}_${branchId}`,
            platform: 'electron',
            browser: 'electron',
            deviceName: `POS Terminal (${session?.terminalName || terminalId})`,
            appName: 'pos',
            role: 'pos',
            branchId,
            terminalId
          })
        });
        isRegisteredRef.current = true;
        return;
      }

      // Native Capacitor on Android / iOS
      if (Capacitor.isNativePlatform()) {
        await createChannels();

        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === ('prompt-with-rationale' as any)) {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          console.warn('[POS PushManager] Native push permission not granted');
          return;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (pushToken) => {
          if (pushToken.value) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: pushToken.value,
                platform: Capacitor.getPlatform(),
                deviceName: `${Capacitor.getPlatform().toUpperCase()} POS Terminal`,
                appName: 'pos',
                role: 'pos',
                branchId,
                terminalId
              })
            }).catch(() => {});
            isRegisteredRef.current = true;
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[POS PushManager] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[POS PushManager] Push received in foreground:', notification);
          SoundAlertEngine.playSound('new_online_order');
        });

        await PushNotifications.register();
        return;
      }

      // Web Push via Service Worker & Firebase Messaging
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => null);
        const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
        const { app } = await import('../lib/firebase');
        const supported = await isSupported().catch(() => false);
        if (supported) {
          const messaging = getMessaging(app);
          const currentToken = await getToken(messaging, {
            vapidKey: 'BDfxvZSqSw6Es3dvXz4VZMwjNFKMCCfRSgdCVty3rfqqBZ6AAWFlZ2EwWQR8ltp6DRMTUKOmH9Rlu0fjCziOKDk',
            serviceWorkerRegistration: swReg || undefined
          }).catch(() => null);

          if (currentToken) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: currentToken,
                platform: 'web',
                browser: navigator.userAgent,
                deviceName: navigator.platform || 'Web Terminal',
                appName: 'pos',
                role: 'pos',
                branchId,
                terminalId
              })
            });
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[POS PushManager] Token registration warning:', err.message);
    }
  }, [session, activeBranchId, createChannels]);

  // 3. Evaluate Permission State on Mount / Session Change
  useEffect(() => {
    if (!session && !user) return;

    NotificationPermissionManager.checkPermission().then((info) => {
      if (info.state === 'NOT_DETERMINED') {
        setShowPromptBanner(true);
      } else if (info.state === 'GRANTED') {
        registerToken();
      }
    });
  }, [session, user, registerToken]);

  // 4. BroadcastChannel listener for background SW notifications
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('olive_pizza_notifications');
    channel.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'START_ALERT' || data.type === 'NEW_NOTIFICATION') {
        SoundAlertEngine.playSound('new_online_order');
      }
    };
    return () => {
      channel.close();
    };
  }, []);

  const handleEnablePermission = async () => {
    SoundAlertEngine.unlockAudio();
    SoundAlertEngine.playSound('test');
    const res = await NotificationPermissionManager.requestPermission();
    setShowPromptBanner(false);

    if (res.state === 'GRANTED') {
      toast.success('POS order notifications & chime enabled!');
      await registerToken();
    } else if (res.state === 'BLOCKED') {
      toast.error('Notifications blocked by browser. Please enable them in browser settings.');
    }
  };

  // 5. Realtime Listener for Online Orders Arriving at this POS Terminal's Branch
  useEffect(() => {
    const branchId = session?.branchId || activeBranchId;
    if (!branchId) return;

    const q = query(
      collection(db, 'orders'),
      where('branchId', '==', branchId),
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
  }, [session, activeBranchId]);

  return (
    <>
      {showPromptBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 rounded-2xl p-4 shadow-2xl shadow-cyan-500/10 text-white animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-cyan-300">Enable Order Chimes & Alerts</h4>
                <button 
                  onClick={() => setShowPromptBanner(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Allow notifications and chimes so this billing terminal is alerted instantly when online orders arrive.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleEnablePermission}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Enable Chimes & Alerts
                </button>
                <button
                  onClick={() => setShowPromptBanner(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
