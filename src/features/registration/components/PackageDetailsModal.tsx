import React from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Package as PackageIcon } from 'lucide-react';
import type { Package } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';

interface PackageDetailsModalProps {
  pkg: Package | null;
  isSelected: boolean;
  onSelect: (pkgId: string) => void;
  onClose: () => void;
}

export const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({
  pkg,
  isSelected,
  onSelect,
  onClose,
}) => {
  if (!pkg) return null;

  const inclusions = parsePackageInclusions(pkg.inclusions);

  const handleChoose = () => {
    onSelect(pkg.id);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pkg-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0A0A0A]/85 backdrop-blur-xs animate-modal"
    >
      <div className="w-full max-w-lg sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-white border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#C9A227] p-5 sm:p-7 font-mono text-xs max-h-[90vh] flex flex-col justify-between transition-all">
        {/* Header */}
        <div className="pb-3 border-b-2 border-[#0A0A0A] flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[10px] font-black bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 uppercase tracking-widest">
                {pkg.code}
              </span>
              {isSelected && (
                <span className="bg-[#C9A227] text-[#0A0A0A] text-[9px] font-black uppercase px-2 py-0.5 tracking-wider">
                  CURRENTLY SELECTED
                </span>
              )}
            </div>
            <h3
              id="pkg-details-title"
              className="text-base sm:text-lg font-black uppercase tracking-wider text-[#0A0A0A]"
            >
              {pkg.name}
            </h3>
            <div className="font-mono text-xl sm:text-2xl font-black text-[#9A7816] mt-1">
              {formatCurrency(pkg.amount)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-[#0A0A0A] bg-[#F8F7F4] hover:bg-[#0A0A0A] hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        {pkg.description && (
          <p className="py-2 text-xs text-neutral-600 leading-relaxed font-sans border-b border-neutral-200">
            {pkg.description}
          </p>
        )}

        {/* All Inclusions List (Scrollable for 100+ items) */}
        <div className="py-3 flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="flex items-center justify-between text-[11px] font-black uppercase text-[#0A0A0A] mb-1">
            <span className="flex items-center gap-1.5">
              <PackageIcon className="w-3.5 h-3.5 text-[#C9A227]" />
              <span>Full Package Inclusions</span>
            </span>
            <span className="text-[#9A7816] font-mono">{inclusions.length} Items</span>
          </div>

          {inclusions.length === 0 ? (
            <p className="text-neutral-400 italic text-center py-4">No specific inclusions listed for this package.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inclusions.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-2 bg-[#F8F7F4] border border-neutral-200 text-neutral-800"
                >
                  <span className="shrink-0 w-5 text-center font-mono font-black text-[9px] text-neutral-500 mt-0.5">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <Check className="w-4 h-4 text-[#C9A227] shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold leading-relaxed font-sans">{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t-2 border-[#0A0A0A] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-tactile px-4 py-2 bg-[#F8F7F4] text-neutral-700 border border-neutral-400 font-bold uppercase cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleChoose}
            className={`btn-tactile px-5 py-2 font-black uppercase tracking-wider border cursor-pointer ${
              isSelected
                ? 'bg-neutral-300 text-neutral-600 border-neutral-400 cursor-default'
                : 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A] hover:bg-neutral-800 shadow-[3px_3px_0px_#C9A227]'
            }`}
          >
            {isSelected ? 'Currently Chosen' : 'Select This Package'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
