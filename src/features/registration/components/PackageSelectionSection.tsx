import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, ArrowRight, ArrowLeft, Check, Gift, ListChecks, Printer, Camera, Frame, Images, Columns3, Hand } from 'lucide-react';
import { type OptionPicks } from '../../../utils/packageOptions';
import { parseInclusionTree, topLevelLabels } from '../../../utils/inclusions';
import type { Package, AddOn, Gender } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { packageSummary } from '../../../utils/packageSummary';
import { PackageDetailsModal } from './PackageDetailsModal';
import { PackageCompareModal } from './PackageCompareModal';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';
import { isMakeupArtistService } from '../registrationAddOns';

const preferredPackageWidth = 320;
const packagePeekWidth = 32;

function packageAtScrollOffset(scrollLeft: number, { width, gap, padding }: { width: number; gap: number; padding: number }, count: number) {
  // All cards share a width. Advance when less than half of the leading card remains visible.
  return Math.max(0, Math.min(count - 1, Math.ceil((scrollLeft - padding - width / 2) / (width + gap))));
}

interface PackageSelectionSectionProps {
  packages: Package[];
  selectedPackageId: string | null;
  onSelectPackage: (id: string) => void;
  addOnsList: AddOn[];
  defaultAddOn?: AddOn;
  selectedAddOns: string[];
  onToggleAddOn: (id: string) => void;
  onSelectMakeupService: (id: string) => void;
  paymentType: 'full' | 'downpayment';
  onPaymentTypeChange: (type: 'full' | 'downpayment') => void;
  totalAmount: number;
  amountDueNow: number;
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
  onSelectMakeupService,
  paymentType,
  onPaymentTypeChange,
  totalAmount,
  amountDueNow,
  errors,
  emptyMessage,
  gender,
  optionPicks,
  part = 'all',
  onOptionPicksChange,
}) => {
  const makeupServiceGroup = useId();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [viewedIndex, setViewedIndex] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardGeometry = useRef({ width: preferredPackageWidth, gap: 0, padding: 0 });
  const viewingPackage = packages.find((pkg) => pkg.id === detailsId) ?? null;

  const cards = useMemo(() => part === 'extras' ? [] : packages.map((pkg) => {
    const summary = packageSummary(pkg);
    const photoCount = (pkg.photos ?? []).filter(Boolean).length;
    const highlights = [...new Set([...summary.printPoses.map((pose) => pose.title), ...summary.poses])];
    const fallback = summary.prints || summary.frame ? [] : topLevelLabels(parseInclusionTree(pkg.inclusions));
    const labels = highlights.length ? highlights : fallback;
    const listed = labels.slice(0, 4);
    return { pkg, summary, photoCount, listed, remainingCount: labels.length - listed.length };
  }), [packages, part]);

  // A position update should only change the navigation, keeping the card elements stable.
  const packageCards = useMemo(() => cards.map(({ pkg, summary, photoCount, listed, remainingCount }) => {
    const isSelected = selectedPackageId === pkg.id;
    const freebieCount = summary.freebies.length;
    const choiceGroups = summary.options;
    const chip = `flex items-center gap-1 px-1.5 py-0.5 border text-[10px] font-black uppercase ${
      isSelected ? 'border-gold/60 text-gold' : 'border-gold/50 text-gold-soft bg-gold-wash'
    }`;

    return (
      <div
        key={pkg.id}
        onClick={() => onSelectPackage(pkg.id)}
        // Hover: lifts 4px (the track's pt-3 leaves room, so the top border isn't clipped),
        // glows gold, and a gold bar sweeps across the top. The chosen card keeps the bar.
        className={`group p-5 border-2 flex flex-col justify-between relative shrink-0 w-(--package-width) snap-start cursor-pointer
          transition-[transform,border-color,box-shadow,background-color] duration-300 ease-out hover-any:-translate-y-1 motion-reduce:hover-any:translate-y-0
          before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gold before:origin-left before:transition-transform before:duration-300 before:ease-out motion-reduce:before:transition-none ${
          // hover-any: (index.css) applies on every screen, unlike Tailwind's hover:. Touch screens also get
          // the look while the finger is down (active:), and the chosen card keeps the bar.
          isSelected ? 'before:scale-x-100' : 'before:scale-x-0 hover-any:before:scale-x-100 active:before:scale-x-100 active:border-gold active:shadow-lux-gold'
        } ${
          isSelected
            ? 'bg-obsidian text-white border-line shadow-lux-gold'
            : 'bg-panel text-ink border-neutral-300 hover-any:border-gold hover-any:shadow-lux-gold'
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
            onClick={(event) => { event.stopPropagation(); setDetailsId(pkg.id); }}
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
            onClick={(event) => { event.stopPropagation(); onSelectPackage(pkg.id); }}
            className={`btn-tactile w-full min-h-14 px-3 flex items-center justify-center gap-2 border-2 text-sm font-black uppercase tracking-widest cursor-pointer ${
              isSelected
                ? 'bg-transparent text-gold border-gold'
                : 'bg-gold text-on-gold border-gold shadow-lux-gold hover:bg-gold-bright'
            }`}
          >
            {isSelected
              ? <><Check className="w-5 h-5 shrink-0" strokeWidth={3} aria-hidden="true" /> Chosen</>
              : <><Hand className="w-5 h-5 shrink-0" aria-hidden="true" /> Choose this package</>}
          </button>
          {isSelected && (
            <p className="text-center text-[10px] font-bold uppercase tracking-wider text-neutral-300">
              Tap Next below to continue
            </p>
          )}
        </div>
      </div>
    );
  }), [cards, onSelectPackage, selectedPackageId]);

  /** Brings package `index` to the leading edge of the track. */
  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    const first = track?.children[0] as HTMLElement | undefined;
    const card = track?.children[Math.max(0, Math.min(index, packages.length - 1))] as HTMLElement | undefined;
    if (!track || !first || !card) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({ left: card.offsetLeft - first.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  };
  const browsing = hasOverflow && packages.length > 1;
  const atStart = viewedIndex <= 0;
  const atEnd = viewedIndex >= packages.length - 1;

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !packages.length) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const availableWidth = entry.contentRect.width;
      if (availableWidth === 0) return;

      const style = getComputedStyle(track);
      const gap = parseFloat(style.columnGap);
      const padding = parseFloat(style.paddingLeft);
      const visibleCount = Math.max(1, Math.round((availableWidth - packagePeekWidth) / (preferredPackageWidth + gap)));
      const overflowing = packages.length > visibleCount;
      // Leave room for a gap and a sliver of the next card at each leading snap position.
      const reservedWidth = overflowing ? gap + packagePeekWidth : 0;
      const cardCount = overflowing ? visibleCount : packages.length;
      const fittedWidth = (availableWidth - reservedWidth - (cardCount - 1) * gap) / cardCount;
      const cardWidth = Math.max(1, overflowing ? fittedWidth : Math.min(preferredPackageWidth, fittedWidth));

      track.style.setProperty('--package-width', `${cardWidth}px`);
      const geometry = { width: cardWidth, gap, padding };
      cardGeometry.current = geometry;
      setHasOverflow(overflowing);
      setViewedIndex(packageAtScrollOffset(track.scrollLeft, geometry, packages.length));
    });
    resizeObserver.observe(track);
    return () => resizeObserver.disconnect();
  }, [packages.length, part]);

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
            <output className="text-xs font-black tabular-nums text-gold-soft" aria-label="Package browsing position">
              {Math.min(viewedIndex + 1, packages.length)} of {packages.length}
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
      <div className="relative">
      <div
        ref={trackRef}
        onScroll={(event) => {
          const next = packageAtScrollOffset(event.currentTarget.scrollLeft, cardGeometry.current, packages.length);
          if (next !== viewedIndex) setViewedIndex(next);
        }}
        role="group"
        aria-label="Available packages"
        tabIndex={0}
        className={`${packages.length ? 'flex' : 'hidden'} overflow-x-auto gap-4 pt-3 pb-4 snap-x snap-mandatory scrollbar-thin -mx-2 px-2 scroll-px-2 [--package-width:min(320px,100%)] ${
          // Leave room for the last card to reach the leading snap position on wide screens.
          hasOverflow && packages.length > 1 ? 'after:shrink-0 after:-ml-4 after:w-[calc(100%-var(--package-width))]' : ''
        }`}
      >
        {packageCards}
      </div>
      {browsing && !atEnd && (
        <button type="button" onClick={() => scrollToIndex(viewedIndex + 1)} aria-label="See the next package"
          className="absolute right-0 top-1/2 z-20 -translate-y-1/2 grid size-12 place-items-center rounded-full border-2 border-gold bg-gold text-on-gold shadow-lux-gold cursor-pointer hover:bg-gold-bright">
          <ArrowRight className={`w-6 h-6 ${atStart ? 'animate-nudge-right' : ''}`} strokeWidth={3} aria-hidden="true" />
        </button>
      )}
      </div>
      {browsing && (
        <div className="mt-1 flex items-center justify-between gap-3 border border-gold/40 bg-gold-wash px-2 py-2">
          <button type="button" onClick={() => scrollToIndex(viewedIndex - 1)} disabled={atStart} aria-label="Previous package"
            className="btn-tactile grid size-11 shrink-0 place-items-center border-2 border-gold text-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowLeft className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <p className="text-center text-[11px] font-black uppercase tracking-wider text-ink">
              {atEnd ? 'That’s every package' : <>Swipe to see all {packages.length} packages</>}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {packages.map((pkg, index) => (
                <button key={pkg.id} type="button" onClick={() => scrollToIndex(index)}
                  aria-label={`Show package ${index + 1}: ${pkg.name}`} aria-current={index === viewedIndex ? 'true' : undefined}
                  className={`h-2.5 cursor-pointer transition-all ${index === viewedIndex ? 'w-6 bg-gold' : `w-2.5 ${pkg.id === selectedPackageId ? 'bg-gold-soft' : 'bg-neutral-400'}`}`} />
              ))}
            </div>
          </div>
          <button type="button" onClick={() => scrollToIndex(viewedIndex + 1)} disabled={atEnd} aria-label="Next package"
            className="btn-tactile grid size-11 shrink-0 place-items-center border-2 border-gold bg-gold text-on-gold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
            <ArrowRight className="w-5 h-5" strokeWidth={3} aria-hidden="true" />
          </button>
        </div>
      )}
      {packages.length === 0 && (
        <p className="border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
          {emptyMessage ?? 'No Job Order Packages are currently available.'}
        </p>
      )}

      </>)}

      {part !== 'cards' && (<>
      {part === 'extras' && <h2 id="sec-packages" className="mb-5 border-b-2 border-line pb-2.5 text-sm font-black uppercase tracking-widest text-ink">Add-ons &amp; Payment</h2>}
      {([
        ['Studio Add-ons', 'Add prints, frames, or other studio products to your package.', false,
          addOnsList.filter((addon) => !isMakeupArtistService(addon))],
        ['Makeup Artist Services', 'Choose one optional makeup or grooming service for your pictorial.', true,
          addOnsList.filter(isMakeupArtistService)],
      ] as const).map(([title, description, single, list]) => list.length > 0 && (
        <fieldset key={title} className="mb-6 mt-5 min-w-0 border-t border-line pt-3">
          <legend className="pr-3 font-mono text-[11px] font-black text-ink uppercase tracking-widest">
            {title}
          </legend>
          <p className="mb-3 text-xs text-neutral-600">{description}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(single ? [...list, { id: '', name: 'No additional service' }] : list).map((addon) => {
              const isChecked = addon.id ? selectedAddOns.includes(addon.id)
                : !list.some((item) => selectedAddOns.includes(item.id));
              return (
                <label key={addon.id}
                  className={`btn-tactile min-h-[48px] flex items-center justify-between gap-3 p-3.5 border text-left cursor-pointer focus-within:outline-2 focus-within:outline-gold ${
                    isChecked
                      ? 'border-line bg-gold-wash shadow-lux'
                      : 'border-neutral-300 bg-panel hover:border-line'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <input type={single ? 'radio' : 'checkbox'} name={single ? makeupServiceGroup : undefined}
                      checked={isChecked} onChange={() => single ? onSelectMakeupService(addon.id) : onToggleAddOn(addon.id)}
                      className="size-4 shrink-0 accent-gold" />
                    <span className="text-xs font-bold text-ink uppercase">{addon.name}</span>
                  </span>
                  {'amount' in addon && <span className="font-mono text-xs font-black text-gold-soft shrink-0">
                    +{formatCurrency(addon.amount)}
                  </span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {defaultAddOn && (
        <div className="mt-4 border border-gold bg-gold-wash p-3.5" aria-live="polite">
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Automatically applied services</p>
          <div className="flex items-start justify-between gap-3 text-sm font-bold text-ink">
            <span>{defaultAddOn.name}</span>
            <span className="shrink-0 font-mono">{formatCurrency(defaultAddOn.amount, { exact: true })}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-600">Automatically included because no Makeup / Grooming service was selected.</p>
        </div>
      )}

      {/* Payment Preference & Live Total */}
      <div className="mt-6 p-4 sm:p-5 bg-obsidian text-white border-2 border-line flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="w-full sm:w-auto shrink-0">
          <span className="font-mono text-[10px] text-gold uppercase font-bold tracking-widest block mb-2">
            COUNTER SETTLEMENT MODE
          </span>
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              type="button"
              disabled={!selectedPackageId}
              aria-pressed={!!selectedPackageId && paymentType === 'full'}
              onClick={() => onPaymentTypeChange('full')}
              className={`btn-tactile min-h-11 px-2 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
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
              aria-pressed={!!selectedPackageId && paymentType === 'downpayment'}
              onClick={() => onPaymentTypeChange('downpayment')}
              className={`btn-tactile min-h-11 px-2 sm:px-4 py-2 text-[11px] font-black uppercase tracking-wider border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                selectedPackageId && paymentType === 'downpayment'
                  ? 'bg-gold text-on-gold border-gold'
                  : 'bg-transparent text-neutral-300 border-neutral-700 hover:border-neutral-500'
              }`}
            >
              50% Downpayment
            </button>
          </div>
        </div>

        <dl aria-live="polite" className="w-full min-w-0 space-y-3 border-t border-neutral-800 pt-3 font-mono sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Total Job Order</dt>
            <dd className="text-2xl font-black text-gold [overflow-wrap:anywhere] sm:text-3xl">
              {selectedPackageId ? formatCurrency(totalAmount, { exact: true }) : '₱0.00'}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              {paymentType === 'downpayment' ? 'Required Downpayment (50%)' : 'Amount Due at Cashier'}
            </dt>
            <dd className="text-xl font-black text-gold [overflow-wrap:anywhere] sm:text-2xl">
              {selectedPackageId ? formatCurrency(amountDueNow, { exact: true }) : '₱0.00'}
            </dd>
          </div>
        </dl>
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
        <PackageCompareModal cards={cards} selectedId={selectedPackageId} onSelect={onSelectPackage}
          onDetails={(id) => { setComparing(false); setDetailsId(id); }} onClose={() => setComparing(false)} />
      )}
    </section>
  );
};
