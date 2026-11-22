import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  title: React.ReactNode;
  /** A short line under the title (JO №, client, what is being edited). */
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onClose: () => void;
  /** md: a small form · lg: details · xl: a wide table · full: a workspace (fills the screen). */
  size?: 'md' | 'lg' | 'xl' | 'full';
  /** While saving: Esc, the ✕ and clicks outside do nothing. */
  busy?: boolean;
  /** false: only the ✕ closes it (a workspace where a stray click or Esc would lose work). */
  dismissable?: boolean;
  /** Buttons pinned to the bottom (stay in view while the body scrolls). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const WIDTHS = { md: 'sm:max-w-lg', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl', full: 'sm:max-w-[min(1600px,96vw)]' } as const;

/**
 * The shared popup: a portal over the page with the studio's frame, a title row with ✕, a scrolling
 * body and an optional pinned footer. Full screen on phones. Esc and a click outside close it, but
 * only when it is the top popup (a confirm or receipt opened from inside it closes first). It sits at
 * z-40, so the action popups (z-50) always open above it.
 */
export const Modal: React.FC<ModalProps> = ({ title, subtitle, icon: Icon, onClose, size = 'lg', busy = false, dismissable = true, footer, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isTop = () => {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    return dialogs[dialogs.length - 1] === ref.current;
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissable && !busy && isTop()) { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, dismissable, onClose]);
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
      onMouseDown={(event) => { if (event.target === event.currentTarget && dismissable && !busy && isTop()) onClose(); }}
      className="no-print fixed inset-0 z-40 flex items-stretch sm:items-center justify-center sm:p-4 bg-obsidian/85 backdrop-blur-xs animate-modal">
      <div className={`w-full ${WIDTHS[size]} h-full sm:h-auto sm:max-h-[94dvh] flex flex-col bg-panel sm:border-2 border-line shadow-lux-gold font-mono text-xs text-ink`}>
        <div className="shrink-0 flex items-start justify-between gap-3 p-4 sm:px-6 border-b-2 border-line">
          <div className="min-w-0">
            <h3 id={titleId} className="flex items-center gap-2 text-sm sm:text-base font-black uppercase tracking-wider text-ink">
              {Icon && <Icon className="w-4 h-4 shrink-0 text-gold" />}{title}
            </h3>
            {subtitle && <div className="mt-0.5 text-[11px] font-sans normal-case text-neutral-600">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="w-9 h-9 shrink-0 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold cursor-pointer disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">{children}</div>
        {footer && <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 p-3 sm:px-6 border-t-2 border-line">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
};
