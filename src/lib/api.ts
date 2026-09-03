import { auth } from './firebase';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || 'https://olivepizza-owner.onrender.com';

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
  const terminalId = localStorage.getItem('pos_terminal_id') || 'pos_term_01';
  const branchId = localStorage.getItem('pos_branch_id') || 'main_branch';

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('x-terminal-id', terminalId);
  headers.set('x-branch-id', branchId);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  return fetch(url, {
    ...options,
    headers,
  });
}

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetchPOSApi(endpoint, options);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }
  return res.json();
}
