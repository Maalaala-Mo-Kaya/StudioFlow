import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';

interface PhotoGalleryProps {
  /** Carousel-sized photos, in order. */
  photos: string[];
  /** Full-size photos for the enlarged view (same order); defaults to `photos`. */
  fullPhotos?: string[];
  alt: string;
}

/**
 * Swipe or tap the arrows through a package's photos; tap one to see it full screen. The track
 * scrolls with snap points, so touch swiping is native and smooth on the kiosk tablets.
 */
export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ photos, fullPhotos, alt }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const full = fullPhotos ?? photos;

  const go = (to: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = (to + photos.length) % photos.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (enlarged === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setEnlarged(null); }
      if (e.key === 'ArrowRight') setEnlarged((i) => (i === null ? i : (i + 1) % full.length));
      if (e.key === 'ArrowLeft') setEnlarged((i) => (i === null ? i : (i - 1 + full.length) % full.length));
    };
    // Capture, so Escape closes the photo before the package popup.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enlarged, full.length]);

  if (!photos.length) return null;
  const arrow = 'absolute top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-obsidian/70 text-gold border border-gold/50 cursor-pointer hover:bg-obsidian';

  return (
    <div className="relative theme-night">
      <div ref={trackRef} onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] aspect-[4/3] bg-obsidian border border-line" aria-label={`${alt} photos`}>
        {photos.map((src, i) => (
          <button key={src} type="button" onClick={() => setEnlarged(i)} aria-label={`Enlarge photo ${i + 1} of ${photos.length}`}
            className="relative shrink-0 w-full h-full snap-start cursor-zoom-in">
            <img src={src} alt={`${alt}, photo ${i + 1}`} loading={i ? 'lazy' : 'eager'} draggable={false}
              className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)} className={`${arrow} left-2`}><ChevronLeft className="w-5 h-5" /></button>
          <button type="button" aria-label="Next photo" onClick={() => go(index + 1)} className={`${arrow} right-2`}><ChevronRight className="w-5 h-5" /></button>
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5" aria-hidden="true">
            {photos.map((src, i) => <span key={src} className={`h-1.5 transition-all ${i === index ? 'w-5 bg-gold' : 'w-1.5 bg-white/60'}`} />)}
          </div>
        </>
      )}
      <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 bg-obsidian/75 text-gold text-[10px] font-black font-mono pointer-events-none">
        <Expand className="w-3 h-3" /> {index + 1}/{photos.length}
      </span>

      {enlarged !== null && (
        <div role="dialog" aria-modal="true" aria-label={`${alt}, photo ${enlarged + 1}`}
          onClick={(e) => { if (e.target === e.currentTarget) setEnlarged(null); }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 theme-night">
          <img src={full[enlarged]} alt={`${alt}, photo ${enlarged + 1}`} className="max-w-full max-h-full object-contain select-none" />
          <button type="button" aria-label="Close photo" onClick={() => setEnlarged(null)}
            className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center bg-obsidian/80 text-gold border border-gold/60 cursor-pointer"><X className="w-5 h-5" /></button>
          {full.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={() => setEnlarged((enlarged - 1 + full.length) % full.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-obsidian/80 text-gold border border-gold/60 cursor-pointer"><ChevronLeft className="w-6 h-6" /></button>
              <button type="button" aria-label="Next photo" onClick={() => setEnlarged((enlarged + 1) % full.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-obsidian/80 text-gold border border-gold/60 cursor-pointer"><ChevronRight className="w-6 h-6" /></button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-2 py-1 bg-obsidian/80 text-gold text-xs font-black font-mono">{enlarged + 1} / {full.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
