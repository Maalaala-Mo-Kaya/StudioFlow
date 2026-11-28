import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
const scrollTolerance = 1;
const navigationButton = 'grid size-11 shrink-0 place-items-center cursor-pointer outline-gold focus-visible:outline-2 aria-disabled:cursor-default aria-disabled:opacity-40 aria-[disabled=false]:hover:[&>span]:bg-gold-bright aria-[disabled=false]:active:[&>span]:bg-gold-soft sm:size-12';
const navigationIcon = 'grid size-8 place-items-center border-2 border-gold bg-gold text-on-gold transition-colors motion-reduce:transition-none sm:size-10';

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
  const trackId = useId();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [navigation, setNavigation] = useState({ back: false, forward: false });
  const trackRef = useRef<HTMLDivElement>(null);
  const geometry = useRef<{ end: number; stops: number[] }>({ end: 0, stops: [] });
  const target = useRef<number | null>(null);
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

  const syncNavigation = useCallback((track: HTMLDivElement) => {
    const position = track.scrollLeft;
    const { end } = geometry.current;
    if (target.current !== null && Math.abs(position - target.current) <= scrollTolerance) target.current = null;
    const back = end > scrollTolerance && position > scrollTolerance;
    const forward = end - position > scrollTolerance && end > scrollTolerance;
    setNavigation((current) => current.back === back && current.forward === forward ? current : { back, forward });
  }, []);

  function move(track: HTMLDivElement, direction: 'back' | 'forward' | 'start' | 'end') {
    const { end, stops } = geometry.current;
    const position = target.current ?? track.scrollLeft;
    const next = direction === 'back' ? stops.findLast((stop) => stop < position - scrollTolerance)
      : direction === 'forward' ? stops.find((stop) => stop > position + scrollTolerance)
        : direction === 'start' ? 0 : end;
    if (next === undefined || Math.abs(next - position) <= scrollTolerance) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.current = smooth ? next : null;
    track.scrollTo({ left: next, behavior: smooth ? 'smooth' : 'instant' });
  }

  const browsing = packages.length > 0 && (navigation.back || navigation.forward);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const elements = Array.from(track.querySelectorAll<HTMLElement>(':scope > div'));
    const resizeObserver = new ResizeObserver(() => {
      const style = getComputedStyle(track);
      const gap = parseFloat(style.columnGap);
      const availableWidth = track.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (elements.length && availableWidth > 0) {
        const preferredWidth = Math.min(preferredPackageWidth, availableWidth);
        const fittedCount = Math.max(1, Math.round((availableWidth - packagePeekWidth) / (preferredWidth + gap)));
        const count = Math.min(fittedCount, elements.length);
        const needsPeek = elements.length > count;
        const reserved = needsPeek ? Math.min(gap + packagePeekWidth, availableWidth / 2) : 0;
        const fittedWidth = (availableWidth - reserved - (count - 1) * gap) / count;
        const cardWidth = needsPeek ? fittedWidth : Math.min(preferredWidth, fittedWidth);
        const width = `${cardWidth}px`;
        if (track.style.getPropertyValue('--package-width') !== width) track.style.setProperty('--package-width', width);
      }

      const end = Math.max(0, track.scrollWidth - track.clientWidth);
      const start = elements[0]?.offsetLeft ?? 0;
      // A wide track can reach its end before the last card can align to the left.
      const stops = elements.map((card) => card.offsetLeft - start).filter((stop) => stop < end - scrollTolerance);
      geometry.current = { end, stops: [...stops, end] };
      target.current = null;
      syncNavigation(track);
    });
    resizeObserver.observe(track);
    elements.forEach((card) => resizeObserver.observe(card));
    const clearTarget = () => { target.current = null; };
    track.addEventListener('scrollend', clearTarget);
    return () => {
      resizeObserver.disconnect();
      track.removeEventListener('scrollend', clearTarget);
    };
  }, [cards, syncNavigation]);

  return (
    <section
      {...validationProps('package', errors.package)}
      aria-labelledby="sec-packages"
      tabIndex={-1}
      className="scroll-mt-(--registration-scroll-offset) aria-invalid:outline-2 aria-invalid:outline-offset-8 aria-invalid:outline-red-600"
    >
      {part !== 'extras' && (<>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 border-line pb-2.5">
        <h2
          id="sec-packages"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
        >
          {part === 'cards' ? 'Choose your package' : <>Job Order Package &amp; Add-Ons</>}
        </h2>
        {packages.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 font-mono sm:w-auto">
            {packages.length > 1 && (
              <button type="button" onClick={() => setComparing(true)}
                className="btn-tactile flex items-center gap-1.5 px-2.5 py-1.5 border border-gold text-gold-soft text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-gold-wash">
                <Columns3 className="w-3.5 h-3.5" /> Compare
              </button>
            )}
            <span className="text-xs font-black tabular-nums text-gold-soft">{packages.length} {packages.length === 1 ? 'package' : 'packages'}</span>
            {browsing && (
              <div role="group" aria-label="Package navigation" className="ml-auto flex items-center">
                {(['back', 'forward'] as const).map((direction) => {
                  const Icon = direction === 'back' ? ArrowLeft : ArrowRight;
                  return <button key={direction} type="button" aria-label={direction === 'back' ? 'Previous package' : 'Next package'}
                    aria-controls={trackId} aria-disabled={!navigation[direction]} className={navigationButton}
                    onClick={() => { if (navigation[direction] && trackRef.current) move(trackRef.current, direction); }}>
                    <span className={navigationIcon}><Icon className="size-4 sm:size-5" strokeWidth={3} aria-hidden="true" /></span>
                  </button>;
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {errors.package && (
        <div className="mb-4">
          <RegistrationFieldError field="package" errors={errors} />
        </div>
      )}

      <div
        id={trackId}
        ref={trackRef}
        onScroll={(event) => syncNavigation(event.currentTarget)}
        onPointerDown={() => { target.current = null; }}
        onWheel={() => { target.current = null; }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !browsing) return;
          const direction = { ArrowLeft: 'back', ArrowRight: 'forward', Home: 'start', End: 'end' } as const;
          const action = direction[event.key as keyof typeof direction];
          if (!action) return;
          event.preventDefault();
          move(event.currentTarget, action);
        }}
        role="group"
        aria-label="Available packages"
        tabIndex={0}
        className={`${packages.length ? 'flex' : 'hidden'} relative -mx-2 snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-2 px-2 pt-3 pb-4 scrollbar-thin [--package-width:min(320px,100%)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold`}
      >
        {packageCards}
      </div>
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
