import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onClose,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Confirmation action error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/85 modal-overlay"
    >
      <div className="w-full max-w-md sm:max-w-lg bg-panel border-2 border-line shadow-lux-gold p-6 sm:p-7 space-y-4 font-mono text-xs transition-all">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div className="flex items-center gap-2">
            {isDestructive ? (
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-gold shrink-0" />
            )}
            <h3
              id="confirm-modal-title"
              className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Message */}
        <div className="text-neutral-700 leading-relaxed text-xs sm:text-[13px] py-1 font-sans">
          {message}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="btn-tactile px-4 py-2 bg-canvas text-neutral-700 border border-neutral-400 hover:border-line font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`btn-tactile flex items-center gap-1.5 px-5 py-2 font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 ${
              isDestructive
                ? 'bg-red-600 text-white border-red-800 hover:bg-red-700 shadow-lux'
                : 'bg-obsidian text-gold border-line hover:bg-neutral-800 shadow-lux-gold'
            }`}
          >
            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
