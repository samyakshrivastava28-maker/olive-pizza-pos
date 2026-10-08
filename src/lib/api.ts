import { Capacitor } from '@capacitor/core';
import { auth } from './firebase';

export const PRODUCTION_BACKEND_URL = 'https://olivepizza-owner.onrender.com';
export const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || PRODUCTION_BACKEND_URL;

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
}

const inFlightRequests = new Map<string, Promise<any>>();
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

export function invalidatePOSCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      memoryCache.delete(key);
    }
  }
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

  if (isGet && !forceRefresh && ttlMs > 0) {
    const cached = memoryCache.get(cleanKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
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
        memoryCache.set(cleanKey, {
          data,
          expiresAt: Date.now() + ttlMs,
        });
      }

      return data as T;
    } finally {
      inFlightRequests.delete(cleanKey);
    }
  })();

  if (isGet) {
    inFlightRequests.set(cleanKey, executionPromise);
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

export async function fetchPOSBootstrap(forceRefresh = false): Promise<POSBootstrapResponse> {
  return fetchApi<POSBootstrapResponse>(
    '/api/v1/pos/bootstrap',
    { method: 'GET' },
    { ttlMs: 30000, forceRefresh }
  );
}
