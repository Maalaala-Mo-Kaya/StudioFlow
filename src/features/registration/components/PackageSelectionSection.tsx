import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info, ArrowRight, Check } from 'lucide-react';
import type { Package, AddOn } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { PackageDetailsModal } from './PackageDetailsModal';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

interface PackageSelectionSectionProps {
  packages: Package[];
  selectedPackageId: string | null;
  onSelectPackage: (id: string) => void;
  addOnsList: AddOn[];
  defaultAddOn?: AddOn;
  selectedAddOns: string[];
  onToggleAddOn: (id: string) => void;
  paymentType: 'full' | 'downpayment';
  onPaymentTypeChange: (type: 'full' | 'downpayment') => void;
  totalAmount: number;
  errors: RegistrationErrors;
  /** Shown instead of the package list when it is empty. */
  emptyMessage?: string;
}

export const PackageSelectionSection: React.FC<PackageSelectionSectionProps> = ({
  packages,
  selectedPackageId,
  onSelectPackage,
  addOnsList,
  defaultAddOn,
  selectedAddOns,
  onToggleAddOn,
  paymentType,
  onPaymentTypeChange,
  totalAmount,
  errors,
  emptyMessage,
}) => {
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [viewedIndex, setViewedIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewingPackage = packages.find((pkg) => pkg.id === detailsId) ?? null;

  const updateViewedIndex = useCallback((track: HTMLDivElement) => {
    const viewportLeft = track.getBoundingClientRect().left + track.clientLeft;
    const viewportRight = viewportLeft + track.clientWidth;
    const firstVisible = Array.from(track.children).findIndex((card) => {
      const { left, right, width } = card.getBoundingClientRect();
      const visibleWidth = Math.min(right, viewportRight) - Math.max(left, viewportLeft);
      return visibleWidth >= width / 2;
    });
    if (firstVisible !== -1) setViewedIndex(firstVisible);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => updateViewedIndex(track);
    const resizeObserver = new ResizeObserver(update);
    update();
    resizeObserver.observe(track);
    return () => resizeObserver.disconnect();
  }, [packages, updateViewedIndex]);

  return (
    <section
      {...validationProps('package', errors.package)}
      aria-labelledby="sec-packages"
      tabIndex={-1}
      className="scroll-mt-(--registration-scroll-offset) aria-invalid:outline-2 aria-invalid:outline-offset-8 aria-invalid:outline-red-600"
    >
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b-2 border-line mb-5">
        <h2
          id="sec-packages"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
        >
          <span className="font-mono text-gold-soft mr-2">03 //</span>
          Job Order Package &amp; Add-Ons
        </h2>
        {packages.length > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2 font-mono">
            {packages.length > 1 && (
              <span className="text-[10px] text-neutral-500 uppercase flex items-center gap-1">
                Swipe or Scroll
                <ArrowRight className="w-3 h-3 text-gold-soft" aria-hidden="true" />
              </span>
            )}
            <output className="text-xs font-black tabular-nums text-gold-soft" aria-label="Package browsing position">
              {Math.min(viewedIndex + 1, packages.length)}/{packages.length}
            </output>
          </div>
        )}
      </div>
      {errors.package && (
        <div className="mb-4">
          <RegistrationFieldError field="package" errors={errors} />
        </div>
      )}

      {/* Horizontal Scroll Track for Packages */}
      <div
        ref={trackRef}
        onScroll={(e) => updateViewedIndex(e.currentTarget)}
        role="group"
        aria-label="Available packages"
        tabIndex={0}
        className={`${packages.length ? 'flex' : 'hidden'} overflow-x-auto gap-4 pb-4 snap-x snap-mandatory scrollbar-thin -mx-2 px-2 scroll-px-2 [--package-width:min(85vw,100%)] sm:[--package-width:min(320px,100%)] ${
          // Leave room for the last card to reach the leading snap position on wide screens.
          packages.length > 1 ? 'after:shrink-0 after:-ml-4 after:w-[calc(100%-var(--package-width))]' : ''
        }`}
      >
        {packages.map((pkg) => {
          const isSelected = selectedPackageId === pkg.id;
          const inclusionsArray = parsePackageInclusions(pkg.inclusions);
          const topInclusions = inclusionsArray.slice(0, 3);
          const remainingCount = inclusionsArray.length - topInclusions.length;

          return (
            <div
              key={pkg.id}
              className={`card-interactive p-5 border-2 flex flex-col justify-between relative shrink-0 w-(--package-width) snap-start transition-all ${
                isSelected
                  ? 'bg-obsidian text-white border-line shadow-lux-gold'
                  : 'bg-panel text-ink border-neutral-300 hover:border-line'
              }`}
            >
              {isSelected && (
                <span className="absolute top-3 right-3 bg-gold text-on-gold px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest">
                  SELECTED
                </span>
              )}

              <div>
                <span
                  className={`font-mono text-[11px] font-black uppercase tracking-widest block ${
                    isSelected ? 'text-gold' : 'text-gold-soft'
                  }`}
                >
                  {pkg.code}
                </span>

                <h3
                  className={`text-sm sm:text-base font-black uppercase mt-1 mb-2 line-clamp-1 ${
                    isSelected ? 'text-white' : 'text-ink'
                  }`}
                >
                  {pkg.name}
                </h3>

                <div
                  className={`font-mono text-2xl font-black mb-3 ${
                    isSelected ? 'text-gold' : 'text-ink'
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
                          <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{inc}</span>
                        </li>
                      ))}
                    </ul>

                    {remainingCount > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-mono font-bold text-gold bg-gold/10 px-1.5 py-0.5 border border-gold/30">
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
                  onClick={() => setDetailsId(pkg.id)}
                  className={`w-full py-1.5 text-[11px] font-bold uppercase tracking-wider underline flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'text-gold hover:text-white'
                      : 'text-gold-soft hover:text-ink'
                  }`}
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>View All Inclusions ({inclusionsArray.length})</span>
                </button>

                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectPackage(pkg.id)}
                  className={`w-full min-h-[38px] flex items-center justify-center text-[11px] font-black uppercase tracking-widest cursor-pointer transition ${
                    isSelected
                      ? 'bg-gold text-on-gold'
                      : 'bg-canvas text-ink border border-neutral-300'
                  }`}
                >
                  {isSelected ? '✓ Chosen Package' : 'Choose Package'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {packages.length === 0 && (
        <p className="border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
          {emptyMessage ?? 'No Job Order Packages are currently available.'}
        </p>
      )}

      {/* Optional Add-ons */}
      {addOnsList.length > 0 && (
        <div className="mt-6 pt-5 border-t border-neutral-200">
          <h4 className="font-mono text-[11px] font-black text-ink uppercase tracking-widest mb-3">
            ADDONS (Optional)
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
                      ? 'border-line bg-gold-wash shadow-lux'
                      : 'border-neutral-300 bg-panel hover:border-line'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 flex items-center justify-center border ${
                        isChecked
                          ? 'bg-obsidian border-line text-gold'
                          : 'border-neutral-400 bg-panel'
                      }`}
                    >
                      {isChecked && <span className="text-[10px] font-black">✓</span>}
                    </div>
                    <span className="text-xs font-bold text-ink uppercase">{addon.name}</span>
                  </div>
                  <span className="font-mono text-xs font-black text-gold-soft ml-2 shrink-0">
                    +{formatCurrency(addon.amount)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {defaultAddOn && (
        <div className="mt-4 border border-gold bg-gold-wash p-3.5" aria-live="polite">
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Default service applied</p>
          <div className="flex items-start justify-between gap-3 text-sm font-bold text-ink">
            <span>{defaultAddOn.name}</span>
            <span className="shrink-0 font-mono">{formatCurrency(defaultAddOn.amount, { exact: true })}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-600">Automatically included because no Makeup / Grooming service was selected.</p>
        </div>
      )}

      {/* Payment Preference & Live Total */}
      <div className="mt-6 p-5 bg-obsidian text-white border-2 border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <span className="font-mono text-[10px] text-gold uppercase font-bold tracking-widest block mb-2">
            COUNTER SETTLEMENT MODE
          </span>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              disabled={!selectedPackageId}
              onClick={() => onPaymentTypeChange('full')}
              className={`btn-tactile min-h-[40px] px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedPackageId && paymentType === 'full'
                  ? 'bg-gold text-on-gold border-gold'
                  : 'bg-transparent text-neutral-300 border-neutral-700 hover:border-neutral-500'
              }`}
            >
              Full Payment
            </button>
            <button
              type="button"
              disabled={!selectedPackageId}
              onClick={() => onPaymentTypeChange('downpayment')}
              className={`btn-tactile min-h-[40px] px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedPackageId && paymentType === 'downpayment'
                  ? 'bg-gold text-on-gold border-gold'
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
          <span className="font-mono text-2xl sm:text-3xl font-black text-gold">
            {selectedPackageId ? formatCurrency(totalAmount, { exact: true }) : '₱0.00'}
          </span>
        </div>
      </div>

      {/* Package Inclusions Details Modal */}
      <PackageDetailsModal
        pkg={viewingPackage}
        isSelected={viewingPackage?.id === selectedPackageId}
        onSelect={onSelectPackage}
        onClose={() => setDetailsId(null)}
      />
    </section>
  );
};
