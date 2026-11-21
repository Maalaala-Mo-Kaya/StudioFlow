import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { AddOn, Package } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { PackageShowcase } from '../../packages/PackageShowcase';
import type { PackageConfiguration } from '../../packages/packageBuilder';

export function PackageDetailsModal({ pkg, isSelected, gender, addOns, configuration, onSelect, onClose }: {
  pkg?: Package | null;
  isSelected: boolean;
  gender: string;
  addOns: AddOn[];
  configuration?: PackageConfiguration;
  onSelect: (id: string, configuration: PackageConfiguration) => void;
  onClose: () => void;
}) {
  if (!pkg) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="pkg-details-title"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 p-3 backdrop-blur-xs sm:p-4">
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col border-2 border-line bg-panel text-ink shadow-lux-gold">
        <header className="flex items-start justify-between gap-3 border-b-2 border-line px-4 py-3 sm:px-6">
          <div>
            <p className="font-mono text-xs font-bold text-gold-soft">{pkg.code}{isSelected ? ' · Selected' : ''}</p>
            <h3 id="pkg-details-title" className="text-lg font-black">{pkg.name}</h3>
            <p className="font-mono text-sm font-bold text-gold-soft">{formatCurrency(pkg.amount)} base price</p>
          </div>
          <button type="button" autoFocus aria-label="Close package details" onClick={onClose}
            className="grid size-10 shrink-0 place-items-center border border-line bg-canvas">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-3 sm:px-6">
          <PackageShowcase key={pkg.id + ':' + pkg.builder_version} pkg={pkg} gender={gender} addOns={addOns}
            value={isSelected ? configuration : undefined}
            onConfirm={(selection) => { onSelect(pkg.id, selection); onClose(); }} />
        </div>
      </div>
    </div>, document.body,
  );
}
