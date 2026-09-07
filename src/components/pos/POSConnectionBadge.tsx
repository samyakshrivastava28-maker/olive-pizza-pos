import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertTriangle, ShieldAlert, RefreshCw } from 'lucide-react';
import { BACKEND_URL } from '../../lib/api';
import { usePOSStore } from '../../store/posStore';

export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'OFFLINE' | 'AUTH_ERROR' | 'SERVER_ERROR';

interface POSConnectionBadgeProps {
  className?: string;
}

export const POSConnectionBadge: React.FC<POSConnectionBadgeProps> = ({ className = '' }) => {
  const { isAuthorized, restrictedReason } = usePOSStore();
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const checkConnection = async () => {
    if (!navigator.onLine) {
      setStatus('OFFLINE');
      setLatencyMs(null);
      return;
    }

    if (restrictedReason) {
      setStatus('AUTH_ERROR');
      return;
    }

    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      }).catch(async () => {
        return await fetch(`${BACKEND_URL}/api/health`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store'
        });
      });

      clearTimeout(timeoutId);
      const diff = Date.now() - startTime;
      setLatencyMs(diff);

      if (res && (res.ok || res.status < 500)) {
        if (!isAuthorized && restrictedReason) {
          setStatus('AUTH_ERROR');
        } else {
          setStatus('CONNECTED');
        }
      } else {
        setStatus('SERVER_ERROR');
      }
    } catch (err: any) {
      if (!navigator.onLine) {
        setStatus('OFFLINE');
      } else {
        setStatus('SERVER_ERROR');
      }
      setLatencyMs(null);
    }
  };

  useEffect(() => {
    checkConnection();

    const handleOnline = () => {
      setStatus('CONNECTING');
      checkConnection();
    };
    const handleOffline = () => setStatus('OFFLINE');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(checkConnection, 20000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [isAuthorized, restrictedReason]);

  const badgeConfig: Record<ConnectionStatus, {
    label: string;
    bg: string;
    text: string;
    border: string;
    icon: React.ReactNode;
  }> = {
    CONNECTED: {
      label: 'CONNECTED',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      icon: (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      ),
    },
    CONNECTING: {
      label: 'CONNECTING',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      icon: <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />,
    },
    OFFLINE: {
      label: 'OFFLINE',
      bg: 'bg-zinc-800',
      text: 'text-zinc-400',
      border: 'border-zinc-700',
      icon: <WifiOff className="w-3 h-3 text-zinc-400" />,
    },
    AUTH_ERROR: {
      label: 'AUTH ERROR',
      bg: 'bg-rose-500/15',
      text: 'text-rose-400',
      border: 'border-rose-500/40',
      icon: <ShieldAlert className="w-3 h-3 text-rose-400" />,
    },
    SERVER_ERROR: {
      label: 'SERVER ERROR',
      bg: 'bg-rose-950/40',
      text: 'text-rose-400',
      border: 'border-rose-600/40',
      icon: <AlertTriangle className="w-3 h-3 text-rose-400 animate-bounce" />,
    },
  };

  const current = badgeConfig[status];

  return (
    <button
      type="button"
      onClick={() => checkConnection()}
      title={`POS Network & Server Status: ${status}${latencyMs !== null ? ' (' + latencyMs + 'ms)' : ''} — Click to refresh`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold tracking-wider cursor-pointer transition select-none ${current.bg} ${current.text} ${current.border} ${className}`}
    >
      {current.icon}
      <span>{current.label}</span>
      {status === 'CONNECTED' && latencyMs !== null && (
        <span className="text-[9px] opacity-70 font-normal">{latencyMs}ms</span>
      )}
    </button>
  );
};
