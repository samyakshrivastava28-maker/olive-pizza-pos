import { fetchPOSApi } from '../lib/api';

const DEVICE_ID_KEY = 'olive_device_identity';
const ALARM_SETTING_KEY = 'olive_pos_alarm_enabled';

export class DeviceAlarmService {
  private static instance: DeviceAlarmService;
  private deviceId: string;
  private alarmEnabled: boolean = true;
  private listeners: Set<(enabled: boolean) => void> = new Set();

  private constructor() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    this.deviceId = id;

    const saved = localStorage.getItem(ALARM_SETTING_KEY);
    if (saved !== null) {
      this.alarmEnabled = saved === 'true';
    }
  }

  public static getInstance(): DeviceAlarmService {
    if (!DeviceAlarmService.instance) {
      DeviceAlarmService.instance = new DeviceAlarmService();
    }
    return DeviceAlarmService.instance;
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public isAlarmEnabled(): boolean {
    return this.alarmEnabled;
  }

  public async setAlarmEnabled(enabled: boolean): Promise<void> {
    this.alarmEnabled = enabled;
    localStorage.setItem(ALARM_SETTING_KEY, String(enabled));
    this.notifyListeners();

    try {
      await fetchPOSApi('/api/device/alarm-settings', {
        method: 'PUT',
        body: JSON.stringify({
          appType: 'POS',
          deviceId: this.deviceId,
          alarmEnabled: enabled
        })
      });
    } catch (err) {
      console.warn('[DeviceAlarm] Failed to sync alarm preference to backend:', err);
    }
  }

  public async fetchRemoteSettings(): Promise<boolean> {
    try {
      const res = await fetchPOSApi(`/api/device/alarm-settings?appType=POS&deviceId=${encodeURIComponent(this.deviceId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.alarmEnabled === 'boolean') {
          this.alarmEnabled = data.alarmEnabled;
          localStorage.setItem(ALARM_SETTING_KEY, String(this.alarmEnabled));
          this.notifyListeners();
        }
      }
    } catch (err) {
      console.warn('[DeviceAlarm] Failed to fetch remote alarm settings:', err);
    }
    return this.alarmEnabled;
  }

  public subscribe(listener: (enabled: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.alarmEnabled);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const l of this.listeners) {
      try {
        l(this.alarmEnabled);
      } catch {}
    }
  }
}

export const deviceAlarmService = DeviceAlarmService.getInstance();
