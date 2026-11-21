import React, { useState } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';

interface PackageInclusionsEditorProps {
  inclusions: string[];
  onChange: (inclusions: string[]) => void;
  label?: string;
  /** Quick-add suggestions; defaults to common inclusions. */
  presets?: string[];
  /** What one item is called in hints ("inclusion", "freebie"). */
  itemName?: string;
}

const COMMON_INCLUSION_PRESETS = [
  '1x 8R Glass Frame',
  '4x Wallet Size Prints',
  'Toga & Hood Formal Attire',
  'Filipiniana / Barong Attire',
  'Raw Softcopy via Google Drive',
  'Premium Creative Backdrop',
  'Graduation Cap & Diploma Prop',
];

export const PackageInclusionsEditor: React.FC<PackageInclusionsEditorProps> = ({
  inclusions,
  onChange,
  label = 'Package Inclusions (Dynamic Repeatable List)',
  presets = COMMON_INCLUSION_PRESETS,
  itemName = 'inclusion',
}) => {
  const [newItemText, setNewItemText] = useState('');

  const handleUpdateItem = (index: number, value: string) => {
    const updated = [...inclusions];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemoveItem = (index: number) => {
    const updated = inclusions.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleAddItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    onChange([...inclusions, trimmed]);
    setNewItemText('');
  };

  const handleAddPreset = (preset: string) => {
    if (inclusions.includes(preset)) return;
    onChange([...inclusions, preset]);
  };

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-black uppercase tracking-wider text-ink">
          {label} ({inclusions.length})
        </label>
        <span className="text-[10px] text-neutral-500 font-bold uppercase">
          Inline Editable
        </span>
      </div>

      {/* Preset Suggestions */}
      <div className="p-2.5 bg-canvas border border-neutral-300">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-gold-soft mb-1.5">
          <Sparkles className="w-3 h-3 text-gold" />
          <span>Quick presets:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => {
            const isAdded = inclusions.includes(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => handleAddPreset(preset)}
                disabled={isAdded}
                className={`px-2 py-0.5 text-[10px] font-bold uppercase border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isAdded
                    ? 'bg-neutral-200 text-neutral-500 border-neutral-300'
                    : 'bg-panel text-ink border-neutral-400 hover:border-line hover:bg-gold/20'
                }`}
              >
                + {preset}
              </button>
            );
          })}
        </div>
      </div>

      {/* Repeatable Items List */}
      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {inclusions.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-neutral-300 text-neutral-400 font-sans italic text-xs">
            No {itemName}s added yet. Use the presets above or type a new item below.
          </div>
        ) : (
          inclusions.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-1.5 bg-panel border border-line focus-within:ring-2 focus-within:ring-gold"
            >
              <span className="shrink-0 w-6 text-center font-mono font-black text-[10px] text-neutral-500">
                {String(idx + 1).padStart(2, '0')}
              </span>

              <input
                type="text"
                value={item}
                onChange={(e) => handleUpdateItem(idx, e.target.value)}
                placeholder={`${itemName[0].toUpperCase()}${itemName.slice(1)} description...`}
                className="flex-1 text-xs px-2 py-1 bg-transparent border-0 focus:outline-none text-ink font-semibold"
              />

              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="shrink-0 p-1 text-neutral-400 hover:text-red-600 border border-transparent hover:border-red-600 transition-colors cursor-pointer"
                title={`Remove ${itemName}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add New Inclusion Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddItem();
            }
          }}
          placeholder={`Type a new ${itemName} and press Enter...`}
          className="flex-1 px-3 py-2 bg-panel border border-neutral-400 text-xs focus:outline-none focus:border-line font-semibold"
        />
        <button
          type="button"
          onClick={() => handleAddItem()}
          disabled={!newItemText.trim()}
          className="btn-tactile flex items-center gap-1.5 px-4 py-2 bg-obsidian text-gold font-black uppercase tracking-wider text-xs border border-line cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
};
