import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info, ArrowRight, Check, Gift, ListChecks, Printer, Camera, Frame, Images, Columns3 } from 'lucide-react';
import { type OptionPicks } from '../../../utils/packageOptions';
import { parseInclusionTree, topLevelLabels } from '../../../utils/inclusions';
import type { Package, AddOn, Gender } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { packageSummary } from '../../../utils/packageSummary';
import { PackageDetailsModal } from './PackageDetailsModal';
import { PackageCompareModal } from './PackageCompareModal';
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
  /** The client's gender and option picks, so the package popup can take the picks too. */
  gender?: Gender | '';
  optionPicks?: OptionPicks;
  /** Kiosk steps: "cards" = the packages, "extras" = add-ons, payment mode and total. */
  part?: 'cards' | 'extras' | 'all';
  onOptionPicksChange?: (picks: OptionPicks) => void;
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
  gender,
  optionPicks,
  part = 'all',
  onOptionPicksChange,
}) => {
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
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
      {part !== 'extras' && (<>
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b-2 border-line mb-5">
        <h2
          id="sec-packages"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
        >
          {part === 'cards' ? 'Choose your package' : <>Job Order Package &amp; Add-Ons</>}
        </h2>
        {packages.length > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2 font-mono">
            {packages.length > 1 && (
              <button type="button" onClick={() => setComparing(true)}
                className="btn-tactile flex items-center gap-1.5 px-2.5 py-1.5 border border-gold text-gold-soft text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-gold-wash">
                <Columns3 className="w-3.5 h-3.5" /> Compare
              </button>
            )}
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
          // The flyer's headline: frame, prints, shots, freebies; then what the poses are.
          const summary = packageSummary(pkg);
          // Photos are shown only in the full package view; the card just says they are there.
          const photoCount = (pkg.photos ?? []).filter(Boolean).length;
          const freebieCount = summary.freebies.length;
          const choiceGroups = summary.options;
          const highlights = [
            ...summary.printPoses.map((pose) => pose.title),
            ...summary.poses,
          ].filter((label, i, all) => all.indexOf(label) === i);
          // Older packages written as text: their top-level lines.
          const fallback = summary.prints || summary.frame ? [] : topLevelLabels(parseInclusionTree(pkg.inclusions));
          const listed = (highlights.length ? highlights : fallback).slice(0, 4);
          const remainingCount = (highlights.length ? highlights : fallback).length - listed.length;
          const chip = `flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-black uppercase ${
            isSelected ? 'border-gold/60 text-gold' : 'border-gold/50 text-gold-soft bg-gold-wash'
          }`;

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
                <span className="absolute z-10 top-3 right-3 bg-gold text-on-gold px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest">
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
                  className={`font-mono text-2xl font-black ${summary.tagline ? 'mb-0.5' : 'mb-3'} ${
                    isSelected ? 'text-gold' : 'text-ink'
                  }`}
                >
                  {formatCurrency(pkg.amount)}
                </div>
                {summary.tagline && (
                  <p className={`mb-3 text-xs font-bold line-clamp-1 ${isSelected ? 'text-neutral-200' : 'text-neutral-700'}`}>{summary.tagline}</p>
                )}

                {(summary.frame || summary.prints > 0 || summary.shots || freebieCount > 0) && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {summary.frame && <span className={chip}><Frame className="w-3 h-3" /> Frame</span>}
                    {summary.prints > 0 && <span className={chip}><Printer className="w-3 h-3" /> {summary.prints} prints</span>}
                    {summary.shots && <span className={chip}><Camera className="w-3 h-3" /> {summary.pick ? `Pick ${summary.pick} shots` : 'Unlimited shots'}</span>}
                    {freebieCount > 0 && <span className={chip}><Gift className="w-3 h-3" /> {freebieCount} free</span>}
                  </div>
                )}

                {pkg.description && (
                  <p
                    className={`text-xs mb-3 leading-relaxed line-clamp-2 ${
                      isSelected ? 'text-neutral-300' : 'text-neutral-600'
                    }`}
                  >
                    {pkg.description}
                  </p>
                )}

                {listed.length > 0 && (
                  <div className={`border-t pt-3 mb-4 ${isSelected ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <ul className={`text-[11px] space-y-1.5 ${isSelected ? 'text-neutral-300' : 'text-neutral-600'}`}>
                      {listed.map((inc, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{inc}</span>
                        </li>
                      ))}
                    </ul>
                    {remainingCount > 0 && (
                      <div className="mt-2">
                        <span className="text-[10px] font-mono font-bold text-gold bg-gold/10 px-1.5 py-0.5 border border-gold/30">
                          +{remainingCount} more
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {choiceGroups.length > 0 && (
                  <div className={`flex items-start gap-1.5 mb-2 text-[11px] font-black uppercase ${isSelected ? 'text-white' : 'text-ink'}`}>
                    <ListChecks className="w-3.5 h-3.5 shrink-0 text-gold" />
                    <span>Choose your {choiceGroups.map((group) => group.name.toLowerCase()).join(' & ')}</span>
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
                  <span>View full package</span>
                  {photoCount > 0 && (
                    <span className="flex items-center gap-1 no-underline">· <Images className="w-3.5 h-3.5" /> {photoCount} photo{photoCount === 1 ? '' : 's'}</span>
                  )}
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

      </>)}

      {part !== 'cards' && (<>
      {/* Optional add-ons, then single items sold on their own (switched on by the admin) */}
      {([
        ['ADDONS (Optional)', addOnsList.filter((addon) => !addon.catalog_item)],
        ['EXTRA PRINTS & ITEMS (Optional, price each)', addOnsList.filter((addon) => addon.catalog_item)],
      ] as const).map(([title, list]) => list.length > 0 && (
        <div key={title} className={part === 'extras' ? 'mb-6' : 'mt-6 pt-5 border-t border-neutral-200'}>
          <h4 className="font-mono text-[11px] font-black text-ink uppercase tracking-widest mb-3">
            {title}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((addon) => {
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
      ))}

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

      </>)}

      {/* Package Inclusions Details Modal */}
      <PackageDetailsModal
        pkg={viewingPackage}
        isSelected={viewingPackage?.id === selectedPackageId}
        onSelect={onSelectPackage}
        onClose={() => setDetailsId(null)}
        gender={gender}
        picks={optionPicks}
        onPicksChange={onOptionPicksChange}
        onCompare={packages.length > 1 ? () => { setDetailsId(null); setComparing(true); } : undefined}
      />
      {comparing && (
        <PackageCompareModal packages={packages} selectedId={selectedPackageId} onSelect={onSelectPackage}
          onDetails={(id) => { setComparing(false); setDetailsId(id); }} onClose={() => setComparing(false)} />
      )}
    </section>
  );
};
