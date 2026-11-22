import React, { useState } from 'react';
import { Plus, Trash2, Sparkles, ChevronUp, ChevronDown, FolderPlus } from 'lucide-react';
import type { InclusionSection, PackageInclusion } from '../../../types';
import { countInclusionItems, isSection } from '../../../utils/inclusions';

interface InclusionTreeEditorProps {
  inclusions: PackageInclusion[];
  onChange: (inclusions: PackageInclusion[]) => void;
  label?: string;
}

const PRESETS = [
  'Unlimited shots',
  'Toga w/out cap',
  'Raw softcopy via Google Drive',
  'Premium creative backdrop',
];

const SECTION_EXAMPLE = (): InclusionSection => ({
  title: 'Frame and Prints',
  items: [
    'With 10x12 free frame',
    '33 pcs hard printout copy',
    { title: 'Colored toga w/out cap', items: ['1 pc - 8R', '2 pcs - wallet size', '4 pcs - 2x2', '8 pcs - 1x1'] },
  ],
});

/**
 * Package inclusions as plain items and titled sections ("Frame and Prints") holding items and
 * sub-sections ("Colored toga w/out cap"). Two levels, like a printed package flyer.
 */
export const InclusionTreeEditor: React.FC<InclusionTreeEditorProps> = ({ inclusions, onChange, label = 'Package Inclusions' }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...inclusions, draft.trim()]);
    setDraft('');
  };
  const has = (text: string) => inclusions.some((e) => !isSection(e) && e.toLowerCase() === text.toLowerCase());

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-ink">
          {label} ({countInclusionItems(inclusions)})
        </span>
        <div className="flex gap-1.5">
          {!inclusions.some(isSection) && (
            <button type="button" onClick={() => onChange([...inclusions, SECTION_EXAMPLE()])}
              className="px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
              + Frame &amp; Prints example
            </button>
          )}
          <button type="button" onClick={() => onChange([...inclusions, { title: '', items: [''] }])}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase bg-obsidian text-gold border border-line cursor-pointer">
            <FolderPlus className="w-3 h-3" /> Section
          </button>
        </div>
      </div>

      <div className="p-2.5 bg-canvas border border-neutral-300">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-gold-soft mb-1.5">
          <Sparkles className="w-3 h-3 text-gold" /> Quick presets:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button key={preset} type="button" disabled={has(preset)} onClick={() => onChange([...inclusions, preset])}
              className="px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400 bg-panel text-ink hover:border-line cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              + {preset}
            </button>
          ))}
        </div>
      </div>

      {inclusions.length === 0 ? (
        <div className="p-4 text-center border border-dashed border-neutral-300 text-neutral-400 font-sans italic">
          No inclusions yet. Type an item below, or add a section such as "Frame and Prints" to group items.
        </div>
      ) : (
        <InclusionList items={inclusions} onChange={onChange} depth={0} />
      )}

      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Type an inclusion and press Enter…"
          className="flex-1 px-3 py-2 bg-panel border border-neutral-400 focus:outline-none focus:border-line font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
        <button type="button" onClick={add} disabled={!draft.trim()}
          className="btn-tactile flex items-center gap-1.5 px-4 py-2 bg-obsidian text-gold font-black uppercase tracking-wider border border-line cursor-pointer disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
};

/** One level of the tree: items and sections, each movable and removable. */
function InclusionList({ items, onChange, depth }: { items: PackageInclusion[]; onChange: (items: PackageInclusion[]) => void; depth: number }) {
  const set = (index: number, entry: PackageInclusion) => onChange(items.map((e, i) => (i === index ? entry : e)));
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {items.map((entry, index) => {
        const controls = (
          <div className="flex shrink-0">
            <button type="button" title="Move up" disabled={index === 0} onClick={() => move(index, -1)}
              className="p-1 text-neutral-500 hover:text-ink disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button type="button" title="Move down" disabled={index === items.length - 1} onClick={() => move(index, 1)}
              className="p-1 text-neutral-500 hover:text-ink disabled:opacity-30 cursor-pointer disabled:cursor-default"><ChevronDown className="w-3.5 h-3.5" /></button>
            <button type="button" title={isSection(entry) ? 'Remove section' : 'Remove item'} onClick={() => remove(index)}
              className="p-1 text-neutral-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        );
        if (!isSection(entry)) {
          return (
            <div key={index} className="flex items-center gap-1.5 p-1 bg-panel border border-neutral-300 focus-within:border-line">
              <span className="shrink-0 w-4 text-center text-gold">•</span>
              <input value={entry} onChange={(e) => set(index, e.target.value)} aria-label="Inclusion"
                placeholder="e.g. 33 pcs hard printout copy"
                className="flex-1 min-w-0 px-1.5 py-1 bg-transparent focus:outline-none font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
              {controls}
            </div>
          );
        }
        return (
          <div key={index} className={`border-2 ${depth === 0 ? 'border-gold/60' : 'border-neutral-400'} bg-canvas p-2 space-y-1.5`}>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[9px] font-black uppercase text-gold-soft">{depth === 0 ? 'Section' : 'Sub-section'}</span>
              <input value={entry.title} onChange={(e) => set(index, { ...entry, title: e.target.value })} aria-label="Section title"
                placeholder={depth === 0 ? 'e.g. Frame and Prints' : 'e.g. Colored toga w/out cap'}
                className="flex-1 min-w-0 px-2 py-1 border border-neutral-400 bg-panel font-black uppercase placeholder:normal-case placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
              {controls}
            </div>
            <div className="pl-3 border-l-2 border-neutral-300">
              <InclusionList items={entry.items} depth={depth + 1} onChange={(inner) => set(index, { ...entry, items: inner })} />
              <div className="flex gap-1.5 mt-1.5">
                <button type="button" onClick={() => set(index, { ...entry, items: [...entry.items, ''] })}
                  className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
                  <Plus className="w-3 h-3" /> Item
                </button>
                {depth === 0 && (
                  <button type="button" onClick={() => set(index, { ...entry, items: [...entry.items, { title: '', items: [''] }] })}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
                    <FolderPlus className="w-3 h-3" /> Sub-section
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
