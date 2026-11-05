import React, { useState } from 'react';
import { Info, ArrowRight, Check } from 'lucide-react';
import type { Package, AddOn } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { PackageDetailsModal } from './PackageDetailsModal';

interface PackageSelectionSectionProps {
  packages: Package[];
  selectedPackageId: string;
  onSelectPackage: (id: string) => void;
  addOnsList: AddOn[];
  selectedAddOns: string[];
  onToggleAddOn: (id: string) => void;
  paymentType: 'full' | 'downpayment';
  onPaymentTypeChange: (type: 'full' | 'downpayment') => void;
  totalAmount: number;
}

export const PackageSelectionSection: React.FC<PackageSelectionSectionProps> = ({
  packages,
  selectedPackageId,
  onSelectPackage,
  addOnsList,
  selectedAddOns,
  onToggleAddOn,
  paymentType,
  onPaymentTypeChange,
  totalAmount,
}) => {
  const [viewingPackage, setViewingPackage] = useState<Package | null>(null);

  return (
    <section aria-labelledby="sec-packages">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0A0A0A] mb-5">
        <h2
          id="sec-packages"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-[#0A0A0A] m-0"
        >
          <span className="font-mono text-[#9A7816] mr-2">03 //</span>
          Job Order Package &amp; Add-Ons
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase flex items-center gap-1">
          <span>Swipe or Scroll</span>
          <ArrowRight className="w-3 h-3 text-[#9A7816]" />
        </span>
      </div>

      {/* Horizontal Scroll Track for Packages */}
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-thin -mx-2 px-2">
        {packages.map((pkg) => {
          const isSelected = selectedPackageId === pkg.id;
          const inclusionsArray = parsePackageInclusions(pkg.inclusions);
          const topInclusions = inclusionsArray.slice(0, 3);
          const remainingCount = inclusionsArray.length - topInclusions.length;

          return (
            <div
              key={pkg.id}
              onClick={() => onSelectPackage(pkg.id)}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPackage(pkg.id);
                }
              }}
              className={`card-interactive cursor-pointer p-5 border-2 flex flex-col justify-between relative shrink-0 w-[85vw] sm:w-[320px] max-w-[360px] snap-start transition-all ${
                isSelected
                  ? 'bg-[#0A0A0A] text-white border-[#0A0A0A] shadow-[6px_6px_0px_#C9A227]'
                  : 'bg-white text-[#0A0A0A] border-neutral-300 hover:border-[#0A0A0A]'
              }`}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 bg-[#C9A227] text-[#0A0A0A] px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest">
                  SELECTED
                </span>
              )}

              <div>
                <span
                  className={`font-mono text-[11px] font-black uppercase tracking-widest block ${
                    isSelected ? 'text-[#C9A227]' : 'text-[#9A7816]'
                  }`}
                >
                  {pkg.code}
                </span>

                <h3
                  className={`text-sm sm:text-base font-black uppercase mt-1 mb-2 line-clamp-1 ${
                    isSelected ? 'text-white' : 'text-[#0A0A0A]'
                  }`}
                >
                  {pkg.name}
                </h3>

                <div
                  className={`font-mono text-2xl font-black mb-3 ${
                    isSelected ? 'text-[#C9A227]' : 'text-[#0A0A0A]'
                  }`}
                >
                  {formatCurrency(pkg.amount)}
                </div>

                {pkg.description && (
                  <p
                    className={`text-xs mb-3 leading-relaxed line-clamp-2 ${
                      isSelected ? 'text-neutral-300' : 'text-neutral-600'
                    }`}
                  >
                    {pkg.description}
                  </p>
                )}

                {/* Compact Inclusions Summary (Max 3 Items) */}
                {topInclusions.length > 0 && (
                  <div className={`border-t pt-3 mb-4 ${isSelected ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <ul className={`text-[11px] space-y-1.5 ${isSelected ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {topInclusions.map((inc, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-[#C9A227] shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{inc}</span>
                        </li>
                      ))}
                    </ul>

                    {remainingCount > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-mono font-bold text-[#C9A227] bg-[#C9A227]/10 px-1.5 py-0.5 border border-[#C9A227]/30">
                          +{remainingCount} more inclusions
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingPackage(pkg);
                  }}
                  className={`w-full py-1.5 text-[11px] font-bold uppercase tracking-wider underline flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'text-[#C9A227] hover:text-white'
                      : 'text-[#9A7816] hover:text-[#0A0A0A]'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>View All Inclusions ({inclusionsArray.length})</span>
                </button>

                <div
                  className={`w-full min-h-[38px] flex items-center justify-center text-[11px] font-black uppercase tracking-widest transition ${
                    isSelected
                      ? 'bg-[#C9A227] text-[#0A0A0A]'
                      : 'bg-[#F8F7F4] text-[#0A0A0A] border border-neutral-300'
                  }`}
                >
                  {isSelected ? '✓ Chosen Package' : 'Choose Package'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional Add-ons */}
      {addOnsList.length > 0 && (
        <div className="mt-6 pt-5 border-t border-neutral-200">
          <h4 className="font-mono text-[11px] font-black text-[#0A0A0A] uppercase tracking-widest mb-3">
            OPTIONAL // FRAME &amp; PRINT UPGRADES
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {addOnsList.map((addon) => {
              const isChecked = selectedAddOns.includes(addon.id);
              return (
                <button
                  type="button"
                  key={addon.id}
                  onClick={() => onToggleAddOn(addon.id)}
                  className={`btn-tactile min-h-[48px] flex items-center justify-between p-3.5 border text-left cursor-pointer ${
                    isChecked
                      ? 'border-[#0A0A0A] bg-[#F7F2E0] shadow-[3px_3px_0px_#0A0A0A]'
                      : 'border-neutral-300 bg-white hover:border-[#0A0A0A]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 flex items-center justify-center border ${
                        isChecked
                          ? 'bg-[#0A0A0A] border-[#0A0A0A] text-[#C9A227]'
                          : 'border-neutral-400 bg-white'
                      }`}
                    >
                      {isChecked && <span className="text-[10px] font-black">✓</span>}
                    </div>
                    <span className="text-xs font-bold text-[#0A0A0A] uppercase">{addon.name}</span>
                  </div>
                  <span className="font-mono text-xs font-black text-[#9A7816] ml-2 shrink-0">
                    +{formatCurrency(addon.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment Preference & Live Total */}
      <div className="mt-6 p-5 bg-[#0A0A0A] text-white border-2 border-[#0A0A0A] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <span className="font-mono text-[10px] text-[#C9A227] uppercase font-bold tracking-widest block mb-2">
            COUNTER SETTLEMENT MODE
          </span>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              onClick={() => onPaymentTypeChange('full')}
              className={`btn-tactile min-h-[40px] px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
                paymentType === 'full'
                  ? 'bg-[#C9A227] text-[#0A0A0A] border-[#C9A227]'
                  : 'bg-transparent text-neutral-300 border-neutral-700 hover:border-neutral-500'
              }`}
            >
              Full Payment
            </button>
            <button
              type="button"
              onClick={() => onPaymentTypeChange('downpayment')}
              className={`btn-tactile min-h-[40px] px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
                paymentType === 'downpayment'
                  ? 'bg-[#C9A227] text-[#0A0A0A] border-[#C9A227]'
                  : 'bg-transparent text-neutral-300 border-neutral-700 hover:border-neutral-500'
              }`}
            >
              50% Downpayment
            </button>
          </div>
        </div>

        <div className="w-full sm:w-auto sm:text-right border-t sm:border-t-0 border-neutral-800 pt-3 sm:pt-0 flex sm:block items-center justify-between">
          <span className="font-mono text-[10px] text-neutral-400 uppercase font-bold tracking-widest block">
            Total Job Order
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-black text-[#C9A227]">
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </div>

      {/* Package Inclusions Details Modal */}
      <PackageDetailsModal
        pkg={viewingPackage}
        isSelected={viewingPackage?.id === selectedPackageId}
        onSelect={onSelectPackage}
        onClose={() => setViewingPackage(null)}
      />
    </section>
  );
};
