import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Columns2, GitCompareArrows, ImageOff, Maximize2, X } from 'lucide-react';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import { workflowApi } from '../../hooks/useWorkflowData';
import { untagged } from '../camera/shotTypes';

export interface ViewerPhoto { id: string; name: string; group: string }

const photoUrl = (path: string, photo: ViewerPhoto) =>
  `${workflowApi}${path}/image/${photo.id}?${new URLSearchParams({ group: photo.group, name: photo.name })}`;

/** At most this many photos are compared side by side. */
const COMPARE_MAX = 4;
const perRowKey = 'studioflow-chooser-per-row';
const PER_ROW_CHOICES = [2, 3, 4, 5];

function readPerRow() {
  try {
    const value = Number(localStorage.getItem(perRowKey));
    return PER_ROW_CHOICES.includes(value) ? value : 2;
  } catch { return 2; }
}

/**
 * One photo. `fill`: it fits inside a box of fixed size (side by side on one screen). Otherwise it
 * takes the full width of its column at its own shape (wide for landscape, tall for portrait).
 */
function ViewerImage({ path, photo, fill, onShape }: {
  path: string; photo: ViewerPhoto; fill: boolean;
  /** Reports the photo's width / height once it has loaded. */
  onShape?: (aspect: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const image = useAuthedImage(photoUrl(path, photo), box);
  return (
    <div ref={box} className={fill ? 'flex size-full min-h-0 items-center justify-center' : 'flex w-full items-center justify-center'}>
      {image.src
        ? <img src={image.src} alt={untagged(photo.name)}
          onLoad={(event) => {
            const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
            if (width && height) onShape?.(width / height);
          }}
          className={fill ? 'max-h-full max-w-full object-contain' : 'h-auto max-h-[85dvh] w-full object-contain'} />
        : <p className={`m-0 flex flex-col items-center justify-center gap-1 text-xs text-neutral-400 ${fill ? '' : 'aspect-[3/2] w-full'}`}>
          {image.failed && <ImageOff size={18} />}{image.failed ? 'Image unavailable' : 'Loading photo…'}
        </p>}
    </div>
  );
}

type View = { kind: 'all' } | { kind: 'compare' } | { kind: 'one'; index: number };

/**
 * Columns for `count` photos of shape `aspect` (width / height) on a `width` × `height` area:
 * the number that shows each photo biggest. Landscape photos stack (2 over 1), portraits sit in a row.
 */
function bestColumns(count: number, aspect: number, width: number, height: number, gap = 12) {
  let best = 1;
  let bestSize = 0;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const cellHeight = (height - gap * (rows - 1)) / rows - 40; // the name and buttons under each photo
    const size = Math.min(cellWidth, cellHeight * aspect);
    if (size > bestSize + 1) { best = columns; bestSize = size; }
  }
  return best;
}

function useScreenSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/**
 * One shot type group full screen for the Chooser, three ways:
 * - All: up to 4 photos fill the screen side by side; more are shown at their own shape, 2–5 per row
 *   (the chooser's pick, remembered on this device), and scroll.
 * - Compare: the 2–4 photos ticked "Compare", side by side on one screen, as big as they fit.
 * - One by one: one photo, ← → to move.
 * The client chooses in every view; the same rules apply as on the page (one per type: choosing
 * another swaps it).
 */
export function ChooserGroupViewer({ title, photos, path, selected, disabled, summary, startIndex, onToggle, onClose }: {
  title: string;
  photos: ViewerPhoto[];
  path: string;
  selected: Set<string>;
  disabled: boolean;
  /** "1 selected of 3", shown in the header. */
  summary: string;
  /** null: all; a number: that photo on its own. */
  startIndex: number | null;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(startIndex === null ? { kind: 'all' } : { kind: 'one', index: startIndex });
  // Where Esc goes back to from one by one (or compare): the view it was opened from.
  const [back, setBack] = useState<View | null>(null);
  const [perRow, setPerRow] = useState(readPerRow);
  const [compare, setCompare] = useState<string[]>([]);
  // The photos' shape, from the first one that loads (a shoot's photos share it); landscape until then.
  const [aspect, setAspect] = useState(1.5);
  const screen = useScreenSize();
  const comparing = photos.filter((photo) => compare.includes(photo.id));
  const index = view.kind === 'one' ? Math.min(view.index, photos.length - 1) : -1;
  const current = index >= 0 ? photos[index] : undefined;

  const open = (next: View) => {
    setBack(view.kind === 'one' ? back : view);
    setView(next);
  };
  const changePerRow = (value: number) => {
    setPerRow(value);
    try { localStorage.setItem(perRowKey, String(value)); } catch { /* this visit only */ }
  };
  const toggleCompare = (id: string) => setCompare((list) => list.includes(id)
    ? list.filter((value) => value !== id)
    : list.length >= COMPARE_MAX ? list : [...list, id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (view.kind !== 'all' && back) { setView(back); setBack(null); } else onClose();
      } else if (view.kind === 'one' && event.key === 'ArrowLeft' && index > 0) setView({ kind: 'one', index: index - 1 });
      else if (view.kind === 'one' && event.key === 'ArrowRight' && index < photos.length - 1) setView({ kind: 'one', index: index + 1 });
      else if (current && !disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle(current.id); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view, back, index, photos.length, current, disabled, onToggle, onClose]);

  const nav = 'flex size-11 shrink-0 items-center justify-center border border-line bg-canvas text-ink cursor-pointer disabled:opacity-30';
  const headerButton = 'btn-tactile inline-flex min-h-11 items-center gap-1.5 border border-line px-3 text-xs font-black uppercase tracking-wider text-white cursor-pointer';
  const chooseButton = (photo: ViewerPhoto) => {
    const chosen = selected.has(photo.id);
    return (
      <button type="button" disabled={disabled} onClick={() => onToggle(photo.id)} aria-pressed={chosen}
        className={`btn-tactile inline-flex min-h-11 items-center gap-1.5 px-4 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 ${chosen
          ? 'bg-gold text-on-gold' : 'border border-gold text-gold'}`}>
        {chosen ? <><Check size={16} /> Chosen</> : 'Choose this photo'}
      </button>
    );
  };

  /** A photo's box in the All and Compare views. */
  const cell = (photo: ViewerPhoto, fill: boolean) => {
    const chosen = selected.has(photo.id);
    const marked = compare.includes(photo.id);
    return (
      <div key={photo.id} className={`flex min-w-0 flex-col border-4 bg-black ${fill ? 'min-h-0' : ''} ${chosen ? 'border-gold' : 'border-neutral-800'}`}>
        <button type="button" disabled={disabled} onClick={() => onToggle(photo.id)} aria-pressed={chosen}
          aria-label={`${chosen ? 'Chosen' : 'Choose'} ${untagged(photo.name)}`}
          className={`relative cursor-pointer disabled:cursor-default ${fill ? 'min-h-0 flex-1' : ''}`}>
          <ViewerImage path={path} photo={photo} fill={fill} onShape={setAspect} />
          {chosen && <span className="absolute left-2 top-2 bg-gold p-1 text-black"><Check size={18} /></span>}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 p-1.5">
          <span className="min-w-0 truncate font-mono text-[11px] text-neutral-300">{untagged(photo.name)}</span>
          <span className="flex shrink-0 items-center gap-3">
            {view.kind === 'all' && (
              <label className={`inline-flex min-h-8 items-center gap-1.5 text-[10px] font-black uppercase tracking-wider cursor-pointer ${marked ? 'text-gold' : 'text-neutral-300'}`}>
                <input type="checkbox" checked={marked} disabled={!marked && compare.length >= COMPARE_MAX}
                  onChange={() => toggleCompare(photo.id)} className="size-4" />
                Compare
              </label>
            )}
            <button type="button" onClick={() => open({ kind: 'one', index: photos.indexOf(photo) })}
              className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-gold underline cursor-pointer">
              <Maximize2 size={13} /> One by one
            </button>
          </span>
        </div>
      </div>
    );
  };

  // Up to 4 (or the photos being compared) fill one screen side by side; more flow at their own shape.
  const fitAll = view.kind === 'compare' || photos.length <= COMPARE_MAX;
  const shown = view.kind === 'compare' ? comparing : photos;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title}: ${current ? untagged(current.name) : view.kind === 'compare' ? 'compare' : 'all photos'}`}
      className="theme-night no-print fixed inset-0 z-50 flex flex-col gap-3 bg-black p-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 min-w-0 text-sm font-black uppercase tracking-wider text-gold">
          {title}{view.kind === 'compare' && ' · compare'}
          <span className="ml-2 font-mono text-[11px] font-normal normal-case text-neutral-300">
            {current ? `${index + 1} of ${photos.length}` : `${shown.length} photo${shown.length === 1 ? '' : 's'}`} · {summary}
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {view.kind === 'all' && photos.length > COMPARE_MAX && (
            <div role="group" aria-label="Photos per row" className="flex items-center gap-1">
              <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-neutral-400">Per row</span>
              {PER_ROW_CHOICES.map((value) => (
                <button key={value} type="button" aria-pressed={perRow === value} onClick={() => changePerRow(value)}
                  className={`size-11 border text-sm font-black cursor-pointer ${perRow === value ? 'border-gold bg-gold text-on-gold' : 'border-line text-white'}`}>
                  {value}
                </button>
              ))}
            </div>
          )}
          {view.kind === 'all' && compare.length > 0 && (
            <>
              <button type="button" disabled={compare.length < 2} onClick={() => open({ kind: 'compare' })}
                className={`${headerButton} border-gold bg-gold text-on-gold disabled:opacity-50`}>
                <GitCompareArrows size={16} /> {compare.length < 2 ? 'Tick 1 more to compare' : `Compare ${compare.length} side by side`}
              </button>
              <button type="button" onClick={() => setCompare([])} className={headerButton}>Clear</button>
            </>
          )}
          {view.kind !== 'all' && photos.length > 1 && (
            <button type="button" onClick={() => { setView({ kind: 'all' }); setBack(null); }} className={headerButton}>
              <Columns2 size={16} /> All photos
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className={nav}><X size={18} /></button>
        </div>
      </div>

      {current ? (
        <>
          <div className="flex min-h-0 flex-1 items-center gap-2">
            <button type="button" aria-label="Previous photo" disabled={index === 0} onClick={() => setView({ kind: 'one', index: index - 1 })} className={nav}>
              <ChevronLeft size={20} />
            </button>
            <div className={`flex min-h-0 min-w-0 flex-1 self-stretch border-4 ${selected.has(current.id) ? 'border-gold' : 'border-transparent'}`}>
              <ViewerImage key={current.id} path={path} photo={current} fill />
            </div>
            <button type="button" aria-label="Next photo" disabled={index >= photos.length - 1} onClick={() => setView({ kind: 'one', index: index + 1 })} className={nav}>
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="font-mono text-xs text-neutral-300">{untagged(current.name)}</span>
            {chooseButton(current)}
          </div>
          <p className="m-0 text-center text-[11px] text-neutral-400">
            ← → to move · Enter or Space to choose · Esc {back ? 'back' : 'to close'}
          </p>
        </>
      ) : (
        <>
          {fitAll ? (
            <div className="grid min-h-0 flex-1 gap-3" style={(() => {
              // Header and footer take about 7rem; the rest is shared by the photos.
              const columns = bestColumns(Math.max(1, shown.length), aspect, screen.width - 24, screen.height - 112);
              const rows = Math.ceil(Math.max(1, shown.length) / columns);
              return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` };
            })()}>
              {shown.map((photo) => cell(photo, true))}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid items-start gap-3" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
                {shown.map((photo) => cell(photo, false))}
              </div>
            </div>
          )}
          <p className="m-0 text-center text-[11px] text-neutral-400">
            {view.kind === 'compare'
              ? 'Tap a photo to choose it · One by one to see it on its own · Esc back to all'
              : `Tap a photo to choose it · tick Compare on 2–${COMPARE_MAX} to see them side by side · One by one to see it on its own · Esc to close`}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
