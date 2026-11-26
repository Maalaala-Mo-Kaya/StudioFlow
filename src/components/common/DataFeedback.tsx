import type { ReactNode } from 'react';

export interface DataRequestState {
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  onRetry?: () => void;
}

export function DataFeedback({ loading, refreshing, error, onRetry, loadingMessage = 'Loading records…',
  emptyMessage, className = '' }: DataRequestState & {
  loadingMessage?: ReactNode;
  emptyMessage?: ReactNode;
  className?: string;
}) {
  if (loading || refreshing) return <div role="status" className={`text-sm text-neutral-600 ${className}`}>
    {loading ? loadingMessage : 'Refreshing…'}
  </div>;
  if (error) return (
    <div className={`flex flex-wrap items-center justify-center gap-2 text-sm ${className}`}>
      <p role="alert" className="font-semibold text-red-700">{error}</p>
      {onRetry && <button type="button" onClick={onRetry}
        className="min-h-9 border border-line bg-panel px-3 font-bold text-ink focus-visible:outline-2 focus-visible:outline-gold">
        Retry
      </button>}
    </div>
  );
  return emptyMessage == null ? null : <div role="status" className={`text-sm text-neutral-600 ${className}`}>{emptyMessage}</div>;
}
