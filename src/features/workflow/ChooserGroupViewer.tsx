import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, Columns2, ImageOff, Maximize2, X } from 'lucide-react';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import { workflowApi } from '../../hooks/useWorkflowData';
import { untagged } from '../camera/shotTypes';

export interface ViewerPhoto { id: string; name: string; group: string }

const photoUrl = (path: string, photo: ViewerPhoto) =>
  `${workflowApi}${path}/image/${photo.id}?${new URLSearchParams({ group: photo.group, name: photo.name })}`;

function ViewerImage({ path, photo, fit }: { path: string; photo: ViewerPhoto; fit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const image = useAuthedImage(photoUrl(path, photo), box);
  return (
    <div ref={box} className="flex size-full min-h-0 items-center justify-center">
      {image.src
        ? <img src={image.src} alt={untagged(photo.name)} className={fit} />
        : <p className="m-0 flex flex-col items-center gap-1 text-xs text-neutral-400">
          {image.failed && <ImageOff size={18} />}{image.failed ? 'Image unavailable' : 'Loading photo…'}
        </p>}
    </div>
  );
}

/** Columns for `count` photos side by side: as wide as possible while they still fit the screen. */
function columnsFor(count: number) {
  if (count <= 4) return Math.max(1, count);
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  return 5;
}

/**
 * One shot type group full screen for the Chooser: all its photos side by side (sized to how many
 * there are), or one by one (← →). The client chooses in either view; the same rules apply as on
 * the page (one per type: choosing another swaps it).
 */
export function ChooserGroupViewer({ title, photos, path, selected, disabled, summary, startIndex, onToggle, onClose }: {
  title: string;
  photos: ViewerPhoto[];
  path: string;
  selected: Set<string>;
  disabled: boolean;
  /** "1 selected of 3", shown in the header. */
  summary: string;
  /** null: all side by side; a number: that photo on its own. */
  startIndex: number | null;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState<number | null>(startIndex);
  // Opened from the side-by-side view: Esc goes back there instead of closing.
  const [fromAll, setFromAll] = useState(startIndex === null);
  const current = index === null ? undefined : photos[Math.min(index, photos.length - 1)];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (index !== null && fromAll) setIndex(null); else onClose();
      } else if (index !== null && event.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
      else if (index !== null && event.key === 'ArrowRight' && index < photos.length - 1) setIndex(index + 1);
      else if (current && !disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onToggle(current.id); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, fromAll, photos.length, current, disabled, onToggle, onClose]);

  const nav = 'flex size-11 shrink-0 items-center justify-center border border-line bg-canvas text-ink cursor-pointer disabled:opacity-30';
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
  const columns = columnsFor(photos.length);
  const rows = Math.ceil(photos.length / columns);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${title}: ${current ? untagged(current.name) : 'all photos'}`}
      className="theme-night no-print fixed inset-0 z-50 flex flex-col gap-3 bg-black p-3 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 min-w-0 text-sm font-black uppercase tracking-wider text-gold">
          {title}
          <span className="ml-2 font-mono text-[11px] font-normal normal-case text-neutral-300">
            {current ? `${(index ?? 0) + 1} of ${photos.length}` : `${photos.length} photo${photos.length === 1 ? '' : 's'}`} · {summary}
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          {current && photos.length > 1 && (
            <button type="button" onClick={() => { setIndex(null); setFromAll(true); }}
              className="btn-tactile inline-flex min-h-11 items-center gap-1.5 border border-line px-3 text-xs font-black uppercase tracking-wider text-white cursor-pointer">
              <Columns2 size={16} /> All side by side
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className={nav}><X size={18} /></button>
        </div>
      </div>

      {current ? (
        <>
          <div className="flex min-h-0 flex-1 items-center gap-2">
            <button type="button" aria-label="Previous photo" disabled={(index ?? 0) === 0} onClick={() => setIndex((index ?? 0) - 1)} className={nav}>
              <ChevronLeft size={20} />
            </button>
            <div className={`flex min-h-0 min-w-0 flex-1 self-stretch border-4 ${selected.has(current.id) ? 'border-gold' : 'border-transparent'}`}>
              <ViewerImage key={current.id} path={path} photo={current} fit="max-h-full max-w-full object-contain" />
            </div>
            <button type="button" aria-label="Next photo" disabled={(index ?? 0) >= photos.length - 1} onClick={() => setIndex((index ?? 0) + 1)} className={nav}>
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="font-mono text-xs text-neutral-300">{untagged(current.name)}</span>
            {chooseButton(current)}
          </div>
          <p className="m-0 text-center text-[11px] text-neutral-400">
            ← → to move · Enter or Space to choose · Esc {fromAll ? 'back to all' : 'to close'}
          </p>
        </>
      ) : (
        <>
          <div className={`grid min-h-0 flex-1 gap-3 ${rows > 2 ? 'overflow-y-auto' : ''}`}
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              ...(rows > 2 ? { gridAutoRows: 'calc((100dvh - 9rem) / 2)' } : { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }),
            }}>
            {photos.map((photo, position) => {
              const chosen = selected.has(photo.id);
              return (
                <div key={photo.id} className={`flex min-h-0 min-w-0 flex-col border-4 bg-black ${chosen ? 'border-gold' : 'border-neutral-800'}`}>
                  <button type="button" disabled={disabled} onClick={() => onToggle(photo.id)} aria-pressed={chosen}
                    aria-label={`${chosen ? 'Chosen' : 'Choose'} ${untagged(photo.name)}`}
                    className="relative min-h-0 flex-1 cursor-pointer disabled:cursor-default">
                    <ViewerImage path={path} photo={photo} fit="max-h-full max-w-full object-contain" />
                    {chosen && <span className="absolute left-2 top-2 bg-gold p-1 text-black"><Check size={18} /></span>}
                  </button>
                  <div className="flex items-center justify-between gap-2 p-1.5">
                    <span className="min-w-0 truncate font-mono text-[11px] text-neutral-300">{untagged(photo.name)}</span>
                    <button type="button" onClick={() => { setIndex(position); setFromAll(true); }}
                      className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-wider text-gold underline cursor-pointer">
                      <Maximize2 size={13} /> One by one
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="m-0 text-center text-[11px] text-neutral-400">Tap a photo to choose it · One by one to see it on its own · Esc to close</p>
        </>
      )}
    </div>,
    document.body,
  );
}
