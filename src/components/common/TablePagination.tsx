import type { ReactNode } from 'react';

export function TablePagination({ label, pageLabel, summary, controls, previous, next }: {
  label: string;
  pageLabel: string;
  summary?: string;
  controls?: ReactNode;
  previous?: () => void;
  next?: () => void;
}) {
  const buttonClass = 'min-h-8 border border-line bg-panel px-2 py-1 font-black uppercase focus-visible:outline-2 disabled:opacity-40';
  return (
    <nav aria-label={label} className="flex shrink-0 flex-wrap items-center gap-2 border-t border-neutral-300 bg-panel px-3 py-2 font-mono text-[10px]">
      {summary && <span aria-live="polite" className="font-bold text-neutral-600">{summary}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {controls}
        <button type="button" aria-label="Previous page" disabled={!previous} onClick={previous} className={buttonClass}>Previous</button>
        <span aria-live={summary ? undefined : 'polite'} className="min-w-12 text-center font-black">{pageLabel}</span>
        <button type="button" aria-label="Next page" disabled={!next} onClick={next} className={buttonClass}>Next</button>
      </div>
    </nav>
  );
}
