import React, { useState } from 'react';
import { Plus, Trash2, ListChecks, Pencil, Check, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import type { Gender, PackageOptionChoice, PackageOptionGroup } from '../../../types';
import { OPTION_FOR_LABELS, availableChoices, requiredPicks } from '../../../utils/packageOptions';

interface PackageOptionGroupsEditorProps {
  groups: PackageOptionGroup[];
  onChange: (groups: PackageOptionGroup[]) => void;
  /** The package's inclusions as lines, for "Exchanges": the one a group can swap. */
  inclusionLabels?: string[];
}

const newId = () => Math.random().toString(36).slice(2, 12);

/** An example group, for a quick start: the attire choices from a typical graduation flyer. */
const ATTIRE_EXAMPLE = (): PackageOptionGroup => ({
  id: newId(), name: 'Attire', pick: 1,
  choices: [
    { id: newId(), label: 'Toga w/ cap', for: 'all' },
    { id: newId(), label: 'Filipiniana', for: 'female' },
    { id: newId(), label: 'Glamour shots', for: 'female' },
    { id: newId(), label: 'Coat and tie or Barong', for: 'male' },
  ],
});

const filled = (group: PackageOptionGroup) => group.choices.filter((c) => c.label.trim());
const isEmpty = (group: PackageOptionGroup) => !group.name.trim() && !filled(group).length;

/** What is wrong with a group, in the admin's words (the server refuses the same things). */
function groupProblems(group: PackageOptionGroup): string[] {
  const problems: string[] = [];
  const choices = filled(group);
  if (!group.name.trim()) problems.push('Give the group a name, such as Attire.');
  if (!choices.length) problems.push('Add at least one option.');
  const offered = choices.length + (group.replaces?.trim() ? 1 : 0);
  if (choices.length && group.pick > offered) problems.push(`Clients can't pick ${group.pick}: the group offers ${offered} option(s).`);
  return problems;
}

/** "Female clients see: Toga w/ cap, Filipiniana (choose 1)" */
function seenBy(group: PackageOptionGroup, gender: Gender): string {
  const cleaned = { ...group, choices: filled(group) };
  const labels = availableChoices(cleaned, gender).map((c) => (c.keep ? `Keep ${c.label.trim()}` : c.label.trim()));
  if (!labels.length) return 'no options';
  return `${labels.join(', ')} (choose ${requiredPicks(cleaned, gender)})`;
}

/**
 * Option groups the client chooses from at registration ("Attire — choose 1"). One group is edited
 * at a time; the others show what female and male clients will see. Options never change the price.
 */
export const PackageOptionGroupsEditor: React.FC<PackageOptionGroupsEditorProps> = ({ groups, onChange, inclusionLabels = [] }) => {
  const [openId, setOpenId] = useState<string | null>(null);

  const update = (id: string, patch: Partial<PackageOptionGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const updateChoice = (group: PackageOptionGroup, choiceId: string, patch: Partial<PackageOptionChoice>) =>
    update(group.id, { choices: group.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)) });

  /** Closes the open group: blank option rows are dropped, and an empty group is removed. */
  const closeOpen = (list: PackageOptionGroup[] = groups) => list.flatMap((g) => {
    if (g.id !== openId) return [g];
    if (isEmpty(g)) return [];
    return [{ ...g, choices: filled(g).length ? filled(g) : g.choices.slice(0, 1) }];
  });
  const open = (id: string) => { onChange(closeOpen()); setOpenId(id); };
  const done = () => { onChange(closeOpen()); setOpenId(null); };
  const addGroup = (group: PackageOptionGroup) => { onChange([...closeOpen(), group]); setOpenId(group.id); };

  const realCount = groups.filter((g) => !isEmpty(g)).length;

  return (
    <div className="space-y-3 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-ink">
          <ListChecks className="w-3.5 h-3.5 text-gold" /> Options the client chooses ({realCount})
        </span>
        <div className="flex gap-1.5">
          {!groups.length && (
            <button type="button" onClick={() => addGroup(ATTIRE_EXAMPLE())}
              className="px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
              + Attire example
            </button>
          )}
          <button type="button"
            onClick={() => addGroup({ id: newId(), name: '', pick: 1, choices: [{ id: newId(), label: '', for: 'all' }] })}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase bg-obsidian text-gold border border-line cursor-pointer">
            <Plus className="w-3 h-3" /> Option group
          </button>
        </div>
      </div>
      {!groups.length && (
        <p className="p-3 text-center border border-dashed border-neutral-300 text-neutral-500 font-sans italic">
          No options. Add a group such as Attire when the client picks what they like (included in the price).
        </p>
      )}

      {groups.map((group) => {
        const problems = groupProblems(group);
        if (group.id !== openId) {
          // Closed: a summary of the group and what each client will see.
          return (
            <div key={group.id} className={`p-2.5 border space-y-1.5 ${problems.length ? 'border-red-500' : 'border-line'} bg-canvas`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-black uppercase text-ink">
                    {group.name.trim() || <span className="text-red-700">No name</span>}
                    <span className="ml-2 text-[10px] text-gold-soft">choose {group.pick}</span>
                  </div>
                  {group.replaces?.trim() && (
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-gold-soft">
                      <ArrowLeftRight className="w-3 h-3" /> Exchanges: {group.replaces.trim()}
                      {group.replaces_for && group.replaces_for !== 'all' && <span className="font-normal">(kept by {group.replaces_for} clients only)</span>}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {filled(group).map((choice) => (
                      <span key={choice.id} className="px-1.5 py-0.5 text-[10px] border border-neutral-400 text-neutral-700">
                        {choice.label.trim()}{choice.for !== 'all' && <span className="text-neutral-500"> · {OPTION_FOR_LABELS[choice.for]}</span>}
                        {!!choice.items?.some((i) => i.trim()) && <span className="text-neutral-500"> · {choice.items.map((i) => i.trim()).filter(Boolean).join(', ')}</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => open(group.id)} title="Edit group"
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button type="button" title="Remove group" onClick={() => onChange(groups.filter((g) => g.id !== group.id))}
                    className="p-1.5 text-red-600 border border-neutral-300 hover:border-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {!problems.length && (
                <div className="text-[10px] font-sans text-neutral-600 leading-relaxed">
                  <div><b>Female clients see:</b> {seenBy(group, 'female')}</div>
                  <div><b>Male clients see:</b> {seenBy(group, 'male')}</div>
                </div>
              )}
              {problems.map((p) => (
                <p key={p} className="flex items-center gap-1 text-[10px] font-bold text-red-700"><AlertTriangle className="w-3 h-3" /> {p}</p>
              ))}
            </div>
          );
        }

        // Open: edit the group's name, pick count and options.
        return (
          <div key={group.id} className="p-2.5 border-2 border-gold bg-canvas space-y-2">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <label className="block">
                <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Group name</span>
                <input autoFocus value={group.name} placeholder="e.g. Attire" onChange={(e) => update(group.id, { name: e.target.value })}
                  className="w-full p-1.5 border border-neutral-400 bg-panel font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" />
              </label>
              <label className="block">
                <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Client picks</span>
                <input type="number" min={1} max={Math.max(1, filled(group).length)} value={group.pick}
                  onChange={(e) => update(group.id, { pick: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                  className="w-20 p-1.5 border border-neutral-400 bg-panel font-black" />
              </label>
            </div>
            <label className="block">
              <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Exchanges (optional)</span>
              <select value={group.replaces ?? ''} onChange={(e) => update(group.id, { replaces: e.target.value || undefined })}
                className="w-full p-1.5 border border-neutral-400 bg-panel font-bold">
                <option value="">Nothing: these are extra choices</option>
                {[...new Set([...(group.replaces && !inclusionLabels.includes(group.replaces) ? [group.replaces] : []), ...inclusionLabels])]
                  .map((label) => <option key={label} value={label}>{label}</option>)}
              </select>
              {group.replaces ? (
                <span className="block mt-1 text-[10px] font-sans text-neutral-600">
                  Clients keep <b>{group.replaces}</b> or exchange it for one of the options below. Keeping it counts as a choice.
                </span>
              ) : inclusionLabels.length === 0 ? (
                <span className="block mt-1 text-[10px] font-sans text-neutral-500">Add the package's inclusions first to pick one to exchange.</span>
              ) : null}
            </label>
            {group.replaces && (
              <label className="block">
                <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Who can keep {group.replaces}</span>
                <select value={group.replaces_for || 'all'}
                  onChange={(e) => update(group.id, { replaces_for: e.target.value as 'all' | 'female' | 'male' })}
                  className="w-full p-1.5 border border-neutral-400 bg-panel font-bold">
                  <option value="all">Everyone</option>
                  <option value="female">Female clients only (male clients must exchange it)</option>
                  <option value="male">Male clients only (female clients must exchange it)</option>
                </select>
              </label>
            )}
            <span className="block text-[9px] font-black uppercase text-neutral-600">Options, and who sees each one</span>
            <div className="space-y-1.5">
              {group.choices.map((choice, index) => (
                <div key={choice.id} className="grid grid-cols-[1fr_auto_auto] gap-1.5 pb-1.5 border-b border-neutral-200 last:border-0">
                  <input value={choice.label} placeholder={index === 0 ? 'e.g. Filipiniana' : 'Another option'}
                    autoFocus={index > 0 && !choice.label}
                    onChange={(e) => updateChoice(group, choice.id, { label: e.target.value })}
                    className="w-full p-1.5 border border-neutral-300 bg-panel font-semibold placeholder:italic placeholder:font-normal placeholder:text-neutral-400" aria-label="Option" />
                  <select value={choice.for} aria-label="Who sees this option"
                    onChange={(e) => updateChoice(group, choice.id, { for: e.target.value as PackageOptionChoice['for'] })}
                    className="p-1.5 border border-neutral-300 bg-panel font-bold">
                    {(['all', 'female', 'male'] as const).map((value) => <option key={value} value={value}>{OPTION_FOR_LABELS[value]}</option>)}
                  </select>
                  <button type="button" title="Remove option"
                    onClick={() => update(group.id, { choices: group.choices.filter((c) => c.id !== choice.id) })}
                    className="p-1.5 text-neutral-500 hover:text-red-600 border border-transparent hover:border-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  {/* Kept as typed (split on ";"); cleaned when the package is saved. */}
                  <input value={(choice.items ?? []).join(';')} aria-label="Comes with"
                    onChange={(e) => updateChoice(group, choice.id, { items: e.target.value ? e.target.value.split(';') : [] })}
                    placeholder="Comes with (optional), e.g. 1 pc - 3R; 2 pcs - wallet size"
                    className="col-span-3 w-full px-1.5 py-1 border border-neutral-200 bg-panel text-[11px] placeholder:italic placeholder:text-neutral-400" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button"
                onClick={() => update(group.id, { choices: [...group.choices, { id: newId(), label: '', for: 'all' }] })}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
                <Plus className="w-3 h-3" /> Option
              </button>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => { onChange(groups.filter((g) => g.id !== group.id)); setOpenId(null); }}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-red-600 border border-neutral-300 hover:border-red-600 cursor-pointer">
                  <Trash2 className="w-3 h-3" /> Remove group
                </button>
                <button type="button" onClick={done}
                  className="flex items-center gap-1 px-3 py-1 text-[10px] font-black uppercase bg-obsidian text-gold border border-line cursor-pointer">
                  <Check className="w-3 h-3" /> Done
                </button>
              </div>
            </div>
            {!isEmpty(group) && problems.map((p) => (
              <p key={p} className="flex items-center gap-1 text-[10px] font-bold text-red-700"><AlertTriangle className="w-3 h-3" /> {p}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
};
