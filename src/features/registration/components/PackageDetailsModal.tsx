import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Gift, ListChecks, Camera, Printer, Frame, ArrowLeftRight, Check, Eye, Columns3 } from 'lucide-react';
import type { Gender, Package } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { OPTION_FOR_LABELS, keepValidPicks, type OptionPicks } from '../../../utils/packageOptions';
import { PackageOptionsPicker } from '../../../components/common/PackageOptionsPicker';
import { InclusionTreeView } from '../../../components/common/InclusionTreeView';
import { exchangeNote, packageSummary } from '../../../utils/packageSummary';
import { packagePhotoUrls } from '../../../utils/packagePhotos';
import { PhotoGallery } from '../../../components/common/PhotoGallery';

interface PackageDetailsModalProps {
  pkg: Package | null;
  isSelected: boolean;
  onSelect: (pkgId: string) => void;
  onClose: () => void;
  /** The client's gender and picks, so the options can be chosen here too (the kiosk form). */
  gender?: Gender | '';
  picks?: OptionPicks;
  onPicksChange?: (picks: OptionPicks) => void;
  /** The admin's "Preview as kiosk": no choosing, marked as a preview. */
  preview?: boolean;
  /** Photo URLs to show instead of the saved ones (the preview's unsaved photos). */
  photoUrls?: string[];
  /** Opens Compare packages (when the client has more than one to choose from). */
  onCompare?: () => void;
}

/** Wide enough to put the photos beside the title (the sm breakpoint). */
function useWide() {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setWide(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return wide;
}

/** A headline figure: "36 prints", "Pick 3 shots", "7 free". */
function Stat({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 p-1.5 sm:p-2 border border-gold/50 bg-gold-wash text-center">
      <Icon className="w-4 h-4 mx-auto text-gold" />
      <div className="font-mono text-lg font-black leading-tight text-ink">{value}</div>
      <div className="text-[9px] font-black uppercase tracking-wider text-neutral-600">{label}</div>
    </div>
  );
}

function Heading({ icon: Icon, title, aside }: { icon: React.ComponentType<{ className?: string }>; title: string; aside?: React.ReactNode }) {
  return (
    <h4 className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-line text-[11px] font-black uppercase tracking-widest text-ink">
      <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-gold" /> {title}</span>
      {aside && <span className="font-mono text-gold-soft normal-case tracking-normal">{aside}</span>}
    </h4>
  );
}

/**
 * A package laid out like the studio's flyer: price and headline figures, the shoot, the prints
 * (one card per pose), the freebies and the client's options. Full screen on phones and tablets,
 * a large popup on wider screens, with the price and Choose button always in view.
 */
export const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({
  pkg,
  isSelected,
  onSelect,
  onClose,
  gender = '',
  picks,
  onPicksChange,
  preview = false,
  photoUrls,
  onCompare,
}) => {
  const wide = useWide();
  useEffect(() => {
    if (!pkg) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pkg, onClose]);

  if (!pkg || typeof document === 'undefined') return null;

  const s = packageSummary(pkg);
  const exchanges = s.options.filter((g) => g.replaces);
  const exchanged = new Set(exchanges.map((g) => g.replaces!.toLowerCase()));
  const hasShoot = !!(s.shots || s.poses.length || exchanges.length);
  const hasPrints = !!(s.frame || s.prints || s.printPoses.length || s.loosePrints.length);
  const nothing = !hasShoot && !hasPrints && !s.sections.length && !s.freebies.length;
  const large = photoUrls ?? packagePhotoUrls(pkg, 'large');
  const full = photoUrls ?? packagePhotoUrls(pkg, 'full');
  const gallery = large.length > 0 && <PhotoGallery photos={large} fullPhotos={full} alt={pkg.name || 'Package'} />;

  const handleChoose = () => {
    onSelect(pkg.id);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pkg-details-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-obsidian/85 backdrop-blur-xs animate-modal"
    >
      <div className="w-full sm:max-w-3xl xl:max-w-5xl h-full sm:h-auto sm:max-h-[92vh] bg-panel sm:border-2 border-line shadow-lux-gold font-mono text-xs flex flex-col">
        {/* Header: what it is, what it costs, the headline figures */}
        <div className="p-4 sm:p-6 border-b-2 border-line sm:flex sm:gap-5">
          {wide && gallery && <div className="w-60 lg:w-80 shrink-0">{gallery}</div>}
          <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[10px] font-black bg-obsidian text-gold px-2 py-0.5 uppercase tracking-widest">{pkg.code || 'NEW'}</span>
                {preview && (
                  <span className="flex items-center gap-1 border border-gold text-gold-soft text-[9px] font-black uppercase px-2 py-0.5 tracking-wider">
                    <Eye className="w-3 h-3" /> Kiosk preview
                  </span>
                )}
                {!preview && isSelected && (
                  <span className="bg-gold text-on-gold text-[9px] font-black uppercase px-2 py-0.5 tracking-wider">Currently selected</span>
                )}
              </div>
              <h3 id="pkg-details-title" className="text-lg sm:text-2xl font-black uppercase tracking-wider text-ink">{pkg.name || 'Package name'}</h3>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-2xl sm:text-3xl font-black text-gold-soft">{formatCurrency(pkg.amount, { exact: true })}</span>
                {s.tagline && <span className="text-sm font-bold font-sans text-ink">{s.tagline}</span>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="w-9 h-9 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold transition-colors cursor-pointer shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          {(s.prints > 0 || s.pick > 0 || s.freebies.length > 0 || s.frame) && (
            <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1.5 sm:gap-2">
              {s.frame && <Stat icon={Frame} value="1" label="Frame" />}
              {s.prints > 0 && <Stat icon={Printer} value={s.prints} label="Prints" />}
              {s.shots && <Stat icon={Camera} value={s.pick || '∞'} label={s.pick ? 'Shots you pick' : 'Shots'} />}
              {s.freebies.length > 0 && <Stat icon={Gift} value={s.freebies.length} label="Free extras" />}
            </div>
          )}
          {pkg.description && <p className="mt-3 text-xs font-sans leading-relaxed text-neutral-600">{pkg.description}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {!wide && gallery}
          {nothing && <p className="text-neutral-500 italic text-center py-4 font-sans">No inclusions listed for this package yet.</p>}

          {hasShoot && (
            <section>
              <Heading icon={Camera} title="Your shoot" />
              {s.shots && (
                <p className="mb-2 flex items-start gap-2 text-sm font-bold font-sans text-ink">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-gold" />
                  {s.pick ? <>Unlimited shots; you choose your best {s.pick} photo{s.pick === 1 ? '' : 's'}.</> : s.shots}
                </p>
              )}
              {s.poses.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.poses.map((pose, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1.5 border border-neutral-300 bg-canvas text-xs font-semibold font-sans text-neutral-800">
                      {pose}{exchanged.has(pose.toLowerCase()) && <ArrowLeftRight className="w-3 h-3 text-gold" aria-label="can be exchanged" />}
                    </span>
                  ))}
                </div>
              )}
              {exchanges.map((g) => (
                <p key={g.id} className="mt-2 flex items-start gap-1.5 text-xs font-sans text-neutral-700">
                  <ArrowLeftRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gold" /> <span><b>{g.name}, choose one:</b> {exchangeNote(g)}</span>
                </p>
              ))}
            </section>
          )}

          {hasPrints && (
            <section>
              <Heading icon={Printer} title="Your prints"
                aside={[s.prints ? `${s.prints} pcs hard copy` : '', s.frame ? `+ ${s.frame}` : ''].filter(Boolean).join(' ')} />
              {s.frame && (
                <p className="mb-2 flex items-center gap-2 p-2 border-2 border-gold bg-gold-wash text-sm font-black font-sans text-ink">
                  <Frame className="w-4 h-4 text-gold shrink-0" /> {s.frame.replace(/^./, (c) => c.toUpperCase())}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {s.printPoses.map((pose, i) => (
                  <div key={i} className="p-2.5 border border-gold/40 bg-canvas">
                    <div className="flex items-start justify-between gap-1 text-[11px] font-black uppercase text-ink">
                      {pose.title}
                      {exchanged.has(pose.title.toLowerCase()) && <ArrowLeftRight className="w-3 h-3 shrink-0 text-gold" aria-label="can be exchanged" />}
                    </div>
                    {pose.items.filter((line) => typeof line === 'string').length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {pose.items.filter((line): line is string => typeof line === 'string').map((line, j) => (
                          <li key={j} className="text-xs font-semibold font-sans text-neutral-800">{line}</li>
                        ))}
                      </ul>
                    )}
                    {/* One attire on several backgrounds: "Colored" › 1 pc - 11R, "B&W" › 4 pcs - 2x2 */}
                    {pose.items.filter((line) => typeof line !== 'string').map((sub, j) => typeof sub !== 'string' && (
                      <div key={`s${j}`} className="mt-1.5 pl-2 border-l-2 border-gold/50">
                        <div className="text-[10px] font-black uppercase tracking-wider text-gold-soft">{sub.title}</div>
                        <ul className="space-y-0.5">
                          {sub.items.map((line, k) => (
                            <li key={k} className="text-xs font-semibold font-sans text-neutral-800">{typeof line === 'string' ? line : line.title}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
                {s.loosePrints.length > 0 && (
                  <div className="p-2.5 border border-gold/40 bg-canvas">
                    <div className="text-[11px] font-black uppercase text-ink">{s.printPoses.length ? 'Also' : 'Prints'}</div>
                    <ul className="mt-1 space-y-0.5">
                      {s.loosePrints.map((line, j) => <li key={j} className="text-xs font-semibold font-sans text-neutral-800">{line}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {s.sections.length > 0 && (
            <section>
              <Heading icon={ListChecks} title="Also included" />
              <InclusionTreeView inclusions={s.sections} />
            </section>
          )}

          {s.freebies.length > 0 && (
            <section>
              <Heading icon={Gift} title="Free" aside={`${s.freebies.length} extra${s.freebies.length === 1 ? '' : 's'}`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {s.freebies.map((item, idx) => {
                  const choice = s.options.find((g) => g.freebie && g.name === item.slice(0, 60));
                  return (
                    <div key={idx} className={`flex items-start gap-2 p-2 bg-gold-wash border text-neutral-800 ${choice ? 'border-gold' : 'border-gold/40'}`}>
                      <Gift className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                      <span className="text-xs font-semibold leading-relaxed font-sans">
                        {item}
                        {choice && <span className="block text-[11px] font-normal text-neutral-700">You choose: {choice.choices.map((c) => c.label).join(' / ')}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {s.options.length > 0 && (
            <section>
              <Heading icon={ListChecks} title="Your options" />
              {onPicksChange && !preview ? (
                gender ? (
                  <PackageOptionsPicker groups={s.options} gender={gender} picks={keepValidPicks(s.options, gender, picks ?? {})}
                    onChange={(next) => {
                      // Choosing an option here also chooses this package.
                      if (!isSelected) onSelect(pkg.id);
                      onPicksChange(next);
                    }} />
                ) : (
                  <p className="p-2 border border-dashed border-neutral-400 text-xs font-sans text-neutral-700">
                    Select your gender in Client Information first (some options are for girls or boys only), then choose here or under
                    Package Options below the packages.
                  </p>
                )
              ) : s.options.map((group) => (
                <div key={group.id} className="mb-2">
                  <div className="text-[11px] font-black uppercase text-ink mb-1">{group.name} <span className="text-gold-soft">· choose {group.pick}</span></div>
                  {group.replaces && <p className="mb-1.5 text-xs font-sans text-neutral-700">Keep <b>{group.replaces}</b>, or exchange it for:</p>}
                  <div className="flex flex-wrap gap-2">
                    {group.choices.map((choice) => (
                      <span key={choice.id} className="px-2.5 py-1.5 bg-canvas border border-neutral-300 text-xs font-semibold font-sans text-neutral-800">
                        {choice.label}{choice.for !== 'all' && <span className="text-neutral-500"> ({OPTION_FOR_LABELS[choice.for]})</span>}
                        {!!choice.items?.length && <span className="block text-[10px] font-normal text-neutral-500">{choice.items.join(' · ')}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Footer: always in view */}
        <div className="p-3 sm:px-6 border-t-2 border-line flex items-center justify-between gap-3 bg-panel">
          <span className="text-lg sm:text-xl font-black text-gold-soft">{formatCurrency(pkg.amount, { exact: true })}</span>
          <div className="flex gap-2">
            {onCompare && !preview && (
              <button type="button" onClick={onCompare} aria-label="Compare packages"
                className="btn-tactile min-h-[44px] px-3 flex items-center gap-1.5 bg-canvas text-gold-soft border border-gold font-bold uppercase cursor-pointer">
                <Columns3 className="w-4 h-4" /><span className="hidden md:inline">Compare</span>
              </button>
            )}
            <button type="button" onClick={onClose}
              className="btn-tactile min-h-[44px] px-4 bg-canvas text-neutral-700 border border-neutral-400 font-bold uppercase cursor-pointer">
              Close
            </button>
            {!preview && (
              <button type="button" onClick={handleChoose}
                className={`btn-tactile min-h-[44px] px-5 font-black uppercase tracking-wider border cursor-pointer ${
                  isSelected ? 'bg-neutral-300 text-neutral-600 border-neutral-400 cursor-default' : 'bg-obsidian text-gold border-line hover:bg-neutral-800 shadow-lux-gold'
                }`}>
                {isSelected ? '✓ Chosen' : <>Choose<span className="hidden sm:inline"> this package</span></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
