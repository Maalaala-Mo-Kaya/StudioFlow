import { useId, type ReactNode } from 'react';

export function StationClientQueue({ selected, placeholderIcon, unselected, tools, totalUnselected = unselected.length, empty }: {
  selected: ReactNode;
  placeholderIcon: ReactNode;
  unselected: ReactNode[];
  tools?: ReactNode;
  totalUnselected?: number;
  empty: string;
}) {
  const selectedHeading = useId();
  const unselectedHeading = useId();
  const count = unselected.length;

  return (
    <div className="space-y-8">
      <section aria-labelledby={selectedHeading}>
        <h2 id={selectedHeading} className="mb-4 border-b-2 border-line pb-2 text-sm font-black uppercase tracking-wider text-ink">
          Selected
        </h2>
        <div className="mx-auto max-w-[30rem]">
          {selected ?? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 border-2 border-dashed border-line bg-panel p-5 text-center">
              {placeholderIcon}
              <p className="text-sm font-black uppercase tracking-wider text-ink">No client selected</p>
              {totalUnselected > 0 && <p className="text-xs text-neutral-500">Choose a client from the queue below.</p>}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby={unselectedHeading}>
        <div className="mb-4 flex items-center justify-between gap-2 border-b-2 border-line pb-2">
          <h2 id={unselectedHeading} className="text-sm font-black uppercase tracking-wider text-ink">Unselected</h2>
          <p aria-live="polite" className="border border-line bg-panel px-2 py-1 font-mono text-[11px] font-bold uppercase text-gold-soft">
            {count === totalUnselected ? count : `${count} of ${totalUnselected}`} in queue
          </p>
        </div>
        {tools}
        {count > 0 ? (
          <div role="group" aria-label="Unselected clients, scroll horizontally to browse" tabIndex={0}
            className={`grid grid-flow-col gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-4 focus-visible:outline-2 focus-visible:outline-gold [&>article]:snap-start ${
              count === 1 ? 'auto-cols-[min(100%,30rem)]' : 'auto-cols-[calc(100%-3rem)]'
            } ${count === 2 ? 'md:auto-cols-[calc((100%-1rem)/2)]' : ''} ${
              count > 2 ? 'md:auto-cols-[calc((100%-5rem)/2)]' : ''
            } ${count === 3 ? 'xl:auto-cols-[calc((100%-2rem)/3)]' : ''} ${
              count > 3 ? 'xl:auto-cols-[calc((100%-6rem)/3)]' : ''
            }`}>
            {unselected}
          </div>
        ) : (
          <p className="border-2 border-line bg-panel p-5 text-center text-sm text-neutral-500">{empty}</p>
        )}
      </section>
    </div>
  );
}
