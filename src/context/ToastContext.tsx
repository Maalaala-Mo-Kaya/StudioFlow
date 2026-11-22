import React, { createContext, useContext, useState, useCallback } from 'react';
import { isStaleBuildError, reloadForNewVersion } from '../utils/staleBuild';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  toast: {
    success: (message: string, title?: string) => void;
    error: (message: string, title?: string) => void;
    warning: (message: string, title?: string) => void;
    info: (message: string, title?: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toast = {
    success: (message: string, title?: string) => showToast(message, 'success', title),
    error: (message: string, title?: string) => {
      // An export (or other lazy part) of the old app failed to load after an update: reload once.
      if (isStaleBuildError(message)) {
        if (reloadForNewVersion()) { showToast('StudioFlow was updated. Reloading to load the new version…', 'info', undefined, 0); return; }
        showToast('StudioFlow was updated on the server. Reload the page (Ctrl+F5), then try again.', 'warning', title, 10000);
        return;
      }
      showToast(message, 'error', title, 6000);
    },
    warning: (message: string, title?: string) => showToast(message, 'warning', title, 5000),
    info: (message: string, title?: string) => showToast(message, 'info', title),
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, toast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};

interface ToastContainerProps {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100%-2rem)] pointer-events-none"
    >
      {toasts.map((t) => {
        const isSuccess = t.type === 'success';
        const isError = t.type === 'error';
        const isWarning = t.type === 'warning';

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 border-2 shadow-lux font-mono text-xs transition-all animate-enter ${
              isSuccess
                ? 'bg-obsidian text-white border-line'
                : isError
                ? 'bg-red-950 text-white border-red-600 shadow-lux'
                : isWarning
                ? 'bg-amber-950 text-amber-300 border-amber-500'
                : 'bg-canvas text-ink border-line'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess && <CheckCircle2 className="w-4 h-4 text-gold" />}
              {isError && <AlertCircle className="w-4 h-4 text-red-400" />}
              {isWarning && <AlertTriangle className="w-4 h-4 text-amber-400" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 text-blue-500" />}
            </div>

            <div className="flex-1 min-w-0">
              {t.title && (
                <div
                  className={`font-black uppercase tracking-wider text-[11px] mb-0.5 ${
                    isSuccess ? 'text-gold' : isError ? 'text-red-300' : ''
                  }`}
                >
                  {t.title}
                </div>
              )}
              <div className="leading-relaxed break-words">{t.message}</div>
            </div>

            <button
              type="button"
              onClick={() => onRemove(t.id)}
              className="shrink-0 p-1 hover:opacity-70 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </aside>
  );
};
