import React from 'react';
import { Check } from 'lucide-react';
import type { InclusionSection, PackageInclusion } from '../../types';
import { isSection } from '../../utils/inclusions';

interface InclusionTreeViewProps {
  inclusions: PackageInclusion[];
  /** compact: small chips for catalog cards; full: the kiosk's readable list. */
  variant?: 'compact' | 'full';
}

/** A package's inclusions with their sections ("Frame and Prints" › items, sub-sections). */
export const InclusionTreeView: React.FC<InclusionTreeViewProps> = ({ inclusions, variant = 'full' }) => {
  if (!inclusions.length) return null;
  const compact = variant === 'compact';
  // In the admin's order: neighbouring plain items share one row of chips / one grid.
  const blocks: (string[] | InclusionSection)[] = [];
  for (const entry of inclusions) {
    const lastBlock = blocks[blocks.length - 1];
    if (isSection(entry)) blocks.push(entry);
    else if (Array.isArray(lastBlock)) lastBlock.push(entry);
    else blocks.push([entry]);
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      {blocks.map((block, b) => {
        if (!Array.isArray(block)) {
          return <Section key={b} title={block.title} items={block.items} compact={compact} depth={0} />;
        }
        return compact ? (
          <div key={b} className="flex flex-wrap gap-1">
            {block.map((item, i) => (
              <span key={i} className="px-2 py-0.5 text-[10px] bg-gold-wash border border-neutral-300 text-neutral-700">{item}</span>
            ))}
          </div>
        ) : (
          <ul key={b} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {block.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 p-2 bg-canvas border border-neutral-200 text-neutral-800">
                <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                <span className="text-xs font-semibold leading-relaxed font-sans">{item}</span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
};

function Section({ title, items, compact, depth }: { title: string; items: PackageInclusion[]; compact: boolean; depth: number }) {
  const plain = items.filter((e): e is string => !isSection(e));
  const subs = items.filter(isSection);
  if (compact) {
    return (
      <div className={depth ? 'pl-2 border-l border-neutral-300' : 'p-1.5 border border-neutral-300 bg-canvas'}>
        <div className="text-[10px] font-black uppercase text-ink">{title}</div>
        {plain.length > 0 && <div className="text-[10px] text-neutral-600">{plain.join(' · ')}</div>}
        {subs.map((sub, i) => <Section key={i} title={sub.title} items={sub.items} compact depth={depth + 1} />)}
      </div>
    );
  }
  return (
    <div className={depth ? 'mt-2 pl-3 border-l-2 border-gold/40' : 'p-3 border border-gold/40 bg-canvas'}>
      <div className={`font-black uppercase tracking-wider text-ink ${depth ? 'text-[10px]' : 'text-[11px]'}`}>{title}</div>
      {plain.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {plain.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs font-semibold font-sans text-neutral-800">
              <Check className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" /> {item}
            </li>
          ))}
        </ul>
      )}
      {subs.map((sub, i) => <Section key={i} title={sub.title} items={sub.items} compact={false} depth={depth + 1} />)}
    </div>
  );
}
