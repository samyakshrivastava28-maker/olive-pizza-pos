import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';

export const PRODUCTION_BACKEND_URL = 'https://olivepizza-owner.onrender.com';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && (
      window.location.protocol === 'capacitor:' ||
      window.location.protocol === 'ionic:' ||
      window.location.protocol === 'file:' ||
      navigator.userAgent.includes('Electron')
    ))
  ) {
    return PRODUCTION_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }
  return PRODUCTION_BACKEND_URL;
}

export const BACKEND_URL = getApiBaseUrl();

export function getPOSWebSocketUrl(): string {
  if (BACKEND_URL.startsWith('https://')) {
    return BACKEND_URL.replace('https://', 'wss://') + '/ws';
  }
  if (BACKEND_URL.startsWith('http://')) {
    return BACKEND_URL.replace('http://', 'ws://') + '/ws';
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return 'wss://olivepizza-owner.onrender.com/ws';
}

async function getToken(): Promise<string | null> {
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return auth.currentUser?.getIdToken() || null;
  }
  return null;
}

export async function fetchPOSApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const terminalId = localStorage.getItem('pos_terminal_id') || '';
  const branchId = localStorage.getItem('pos_branch_id') || '';

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (!headers.has('X-App-Target')) {
    headers.set('X-App-Target', 'POS');
  }
  if (!headers.has('X-App-Source')) {
    headers.set('X-App-Source', 'POS');
  }
  if (terminalId) {
    headers.set('x-terminal-id', terminalId);
    headers.set('x-device-id', terminalId);
  }
  if (branchId) {
    headers.set('x-branch-id', branchId);
  }
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

export interface CacheOptions {
  ttlMs?: number;
  forceRefresh?: boolean;
  persist?: boolean;
  swr?: boolean;
  onFreshData?: (data: any) => void;
}

// Canonical TTLs in milliseconds matching Backend Redis Layerbase cache
export const CLIENT_CACHE_TTL = {
  RESTAURANT_STATUS: 60 * 1000,    // 60s (1 min)
  POS_BOOTSTRAP: 30 * 1000,        // 30s
  BRANCH_MENU: 300 * 1000,         // 300s (5 min)
  MASTER_CATALOG: 300 * 1000,      // 300s (5 min)
  APP_CONFIG: 600 * 1000,          // 600s (10 min)
};

const STORAGE_PREFIX = 'op_pos_cache_';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  timestamp: number;
}

const inFlightRequests = new Map<string, Promise<any>>();
const memoryCache = new Map<string, CacheEntry<any>>();

function getCachedEntry<T>(key: string): CacheEntry<T> | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

function setCachedEntry<T>(key: string, data: T, ttlMs: number, persist: boolean = true): void {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    data,
    timestamp: now,
    expiresAt: now + ttlMs,
  };
  memoryCache.set(key, entry);

  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {}
  }
}

export function invalidatePOSCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    return;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const bare = k.replace(STORAGE_PREFIX, '');
          if (regex.test(bare)) keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}

export function invalidateMenuCache(branchId?: string): void {
  if (branchId) {
    invalidatePOSCache(new RegExp(`(menu|catalog).*${branchId}`));
  } else {
    invalidatePOSCache(/(menu|catalog)/);
  }
}

export function invalidateBillsCache(): void {
  invalidatePOSCache(/(bills|orders|bootstrap)/);
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {},
  cacheOptions?: CacheOptions
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const cleanKey = `GET:${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const ttlMs = cacheOptions?.ttlMs ?? 0;
  const forceRefresh = cacheOptions?.forceRefresh ?? false;
  const persist = cacheOptions?.persist ?? true;
  const enableSwr = cacheOptions?.swr ?? true;

  // 1. Check multi-tier cache
  const cachedEntry = isGet && ttlMs > 0 ? getCachedEntry<T>(cleanKey) : null;
  const isFresh = cachedEntry ? Date.now() < cachedEntry.expiresAt : false;

  // 1a. Fresh cache hit -> immediate return (0ms)
  if (isGet && !forceRefresh && cachedEntry && isFresh) {
    return cachedEntry.data;
  }

  // 2. Request deduplication for simultaneous calls
  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
    if (cachedEntry && enableSwr) {
      return cachedEntry.data;
    }
    return inFlightRequests.get(cleanKey);
  }

  const executionPromise = (async () => {
    try {
      const res = await fetchPOSApi(endpoint, options);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (isGet && ttlMs > 0) {
        setCachedEntry(cleanKey, data, ttlMs, persist);
        if (cacheOptions?.onFreshData) {
          try {
            cacheOptions.onFreshData(data);
          } catch (e) {
            console.warn(`[fetchApi] onFreshData handler error for ${cleanKey}:`, e);
          }
        }
      }

      return data as T;
    } finally {
      inFlightRequests.delete(cleanKey);
    }
  })();

  if (isGet) {
    inFlightRequests.set(cleanKey, executionPromise);
  }

  // 3. Stale-While-Revalidate: Return stale cached data immediately (0ms) while background fetch updates
  if (isGet && !forceRefresh && cachedEntry && enableSwr) {
    return cachedEntry.data;
  }

  return executionPromise;
}

// ─── POS SMART BOOTSTRAP AGGREGATOR HELPER ────────────────────────────────────

export interface POSBootstrapResponse {
  success: boolean;
  catalog: any[];
  tables: any[];
  heldCarts: any[];
  shiftSummary: any;
}

export async function fetchPOSBootstrap(
  forceRefresh = false,
  onFreshData?: (data: POSBootstrapResponse) => void
): Promise<POSBootstrapResponse> {
  return fetchApi<POSBootstrapResponse>(
    '/api/v1/pos/bootstrap',
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.POS_BOOTSTRAP, // 30s
      forceRefresh,
      swr: true,
      onFreshData,
    }
  );
}

export async function fetchPOSMenu(
  branchId: string,
  franchiseId?: string,
  forceRefresh = false,
  onFreshData?: (data: any) => void
): Promise<any> {
  const query = franchiseId
    ? `?branchId=${encodeURIComponent(branchId)}&franchiseId=${encodeURIComponent(franchiseId)}`
    : `?branchId=${encodeURIComponent(branchId)}`;
  return fetchApi(
    `/api/pos/menu${query}`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.BRANCH_MENU, // 300s (5 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
      onFreshData,
    }
  );
}

export async function fetchAppConfig(appName: string, forceRefresh = false): Promise<any> {
  return fetchApi(
    `/api/config/${encodeURIComponent(appName)}`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.APP_CONFIG, // 600s (10 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
    }
  );
}
