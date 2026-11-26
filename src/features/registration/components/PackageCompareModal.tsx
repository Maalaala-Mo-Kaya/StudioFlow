import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Columns3, Gift } from 'lucide-react';
import type { Package } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { exchangeNote, type PackageSummary } from '../../../utils/packageSummary';

interface PackageCompareModalProps {
  cards: readonly { pkg: Package; summary: PackageSummary }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDetails: (id: string) => void;
  onClose: () => void;
}


/** Lines a package has: for list rows, a line is marked when not every package has it. */
const linesOf = (s: PackageSummary, row: Row): string[] => {
  switch (row) {
    case 'prints': return [...s.printPoses.flatMap((pose) => {
      // An attire's prints, one line per background: "Toga w/out cap · Colored: 1 pc - 11R, 2 pcs - Wallet".
      const own = pose.items.filter((i): i is string => typeof i === 'string');
      const subs = pose.items.filter((i) => typeof i !== 'string').map((sub) => typeof sub === 'string' ? '' :
        `${pose.title} · ${sub.title}: ${sub.items.map((i) => (typeof i === 'string' ? i : i.title)).join(', ')}`);
      return [...(own.length ? [`${pose.title}: ${own.join(', ')}`] : []), ...subs];
    }), ...s.loosePrints];
    case 'poses': return s.poses;
    case 'options': return s.options.filter((g) => !g.freebie).map((g) => (g.replaces ? `${g.name}: ${exchangeNote(g)}` : `${g.name}: ${g.choices.map((c) => c.label).join(' / ')}`));
    case 'free': return s.freebies.map((f) => {
      const choice = s.options.find((g) => g.freebie && g.name === f.slice(0, 60));
      return choice ? `${f} (choose: ${choice.choices.map((c) => c.label).join(' / ')})` : f;
    });
  }
};
type Row = 'prints' | 'poses' | 'options' | 'free';
const norm = (line: string) => line.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The client's packages side by side (photos, price, frame, prints, shots, poses, options and
 * freebies), with what differs marked, so choosing between "A" and "B" doesn't mean opening each.
 * Columns scroll sideways on narrow screens; the row names stay in view.
 */
export const PackageCompareModal: React.FC<PackageCompareModalProps> = ({ cards, selectedId, onSelect, onDetails, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (typeof document === 'undefined') return null;

  const differs = (values: string[]) => new Set(values).size > 1;
  const mark = 'bg-gold-wash border-l-2 border-gold pl-1.5';

  const scalar = (label: string, values: React.ReactNode[], keys: string[]) => {
    const different = differs(keys);
    return (
    <tr key={label}>
      <th scope="row" className="sticky left-0 z-10 bg-panel p-2 text-left align-top text-[10px] font-black uppercase tracking-wider text-neutral-600 border-b border-line">
        {label}{different && <span className="block text-gold-soft normal-case tracking-normal">◆ differs</span>}
      </th>
      {values.map((value, i) => (
        <td key={cards[i].pkg.id} className={`p-2 align-top border-b border-line text-sm font-bold font-sans text-ink ${different ? 'bg-gold-wash/60' : ''}`}>{value}</td>
      ))}
    </tr>
    );
  };
  const list = (label: string, row: Row) => {
    const columns = cards.map(({ summary }) => linesOf(summary, row).map((line) => ({ line, key: norm(line) })));
    if (columns.every((lines) => !lines.length)) return null;
    const packageCounts = new Map<string, number>();
    for (const lines of columns) {
      for (const key of new Set(lines.map((line) => line.key))) {
        packageCounts.set(key, (packageCounts.get(key) ?? 0) + 1);
      }
    }
    return (
      <tr key={label}>
        <th scope="row" className="sticky left-0 z-10 bg-panel p-2 text-left align-top text-[10px] font-black uppercase tracking-wider text-neutral-600 border-b border-line">{label}</th>
        {columns.map((lines, column) => (
            <td key={cards[column].pkg.id} className="p-2 align-top border-b border-line">
              {lines.length ? (
                <ul className="space-y-1">
                  {lines.map(({ line, key }, i) => (
                    <li key={i} className={`text-xs font-sans text-neutral-800 ${packageCounts.get(key) === cards.length ? '' : mark}`}>
                      {row === 'free' && <Gift className="inline w-3 h-3 mr-1 text-gold" />}{line}
                    </li>
                  ))}
                </ul>
              ) : <span className="text-xs italic text-neutral-400">None</span>}
            </td>
        ))}
      </tr>
    );
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="compare-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-obsidian/85 modal-overlay">
      <div className="w-full sm:max-w-6xl h-full sm:h-auto sm:max-h-[94vh] bg-panel sm:border-2 border-line shadow-lux-gold font-mono text-xs flex flex-col">
        <div className="p-4 sm:px-6 border-b-2 border-line flex items-center justify-between gap-3">
          <div>
            <h3 id="compare-title" className="flex items-center gap-2 text-base sm:text-lg font-black uppercase tracking-wider text-ink">
              <Columns3 className="w-5 h-5 text-gold" /> Compare packages
            </h3>
            <p className="text-[11px] font-sans text-neutral-600">
              <span className={`inline-block px-1 ${mark}`}>Highlighted</span> lines are not in every package.
              {cards.length > 2 && ' Swipe sideways to see them all.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 flex items-center justify-center border border-line bg-canvas hover:bg-gold hover:text-on-gold cursor-pointer shrink-0"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-panel w-24 sm:w-32 border-b-2 border-line" />
                {cards.map(({ pkg, summary: s }) => (
                  <th key={pkg.id} scope="col" className="sticky top-0 z-10 bg-panel p-2 align-top text-left w-[15rem] sm:w-[17rem] border-b-2 border-line">
                    <span className="block text-[10px] font-black text-gold-soft uppercase tracking-widest">{pkg.code}</span>
                    <span className="block text-sm font-black uppercase text-ink">{pkg.name}</span>
                    <span className="block text-xl font-black text-gold-soft">{formatCurrency(pkg.amount, { exact: true })}</span>
                    {s.tagline && <span className="block text-[11px] font-bold font-sans normal-case text-neutral-700">{s.tagline}</span>}
                    {selectedId === pkg.id && <span className="inline-block mt-1 bg-gold text-on-gold text-[9px] font-black uppercase px-2 py-0.5">Selected</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scalar('Frame', cards.map((c) => c.summary.frame || '—'), cards.map((c) => norm(c.summary.frame)))}
              {scalar('Prints', cards.map((c) => (c.summary.prints ? `${c.summary.prints} pcs` : '—')), cards.map((c) => String(c.summary.prints)))}
              {scalar('Shots', cards.map((c) => (c.summary.shots ? (c.summary.pick ? `Unlimited, pick ${c.summary.pick}` : 'Unlimited') : '—')), cards.map((c) => `${c.summary.shots}|${c.summary.pick}`))}
              {list('Print poses', 'prints')}
              {list('Poses', 'poses')}
              {list('Options', 'options')}
              {list('Free', 'free')}
              <tr>
                <th className="sticky left-0 z-10 bg-panel" />
                {cards.map(({ pkg }) => (
                  <td key={pkg.id} className="p-2 align-top space-y-1.5">
                    <button type="button" onClick={() => onDetails(pkg.id)}
                      className="w-full min-h-[38px] border border-neutral-400 bg-canvas text-[11px] font-bold uppercase cursor-pointer">Full details</button>
                    <button type="button" onClick={() => { onSelect(pkg.id); onClose(); }}
                      className={`w-full min-h-[44px] text-[11px] font-black uppercase tracking-wider border cursor-pointer ${
                        selectedId === pkg.id ? 'bg-gold text-on-gold border-gold' : 'bg-obsidian text-gold border-line'}`}>
                      {selectedId === pkg.id ? '✓ Chosen' : 'Choose'}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
};
