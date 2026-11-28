import React, { useState } from 'react';
import { Check, ListChecks, Tags } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { useToast } from '../../../context/ToastContext';
import { workflowError } from '../../../hooks/useWorkflowData';
import { menuTypes, saveShotMenu, type ShotType, type ShotTypeListing } from '../../camera/shotTypes';

/**
 * The shot type the next shots get, as one button per type on the photographer's menu. The
 * client's package types are marked, with how many kept shots each has so far.
 */
export const ShotTypeBar: React.FC<{
  listing: ShotTypeListing | undefined;
  current: string;
  onChange: (code: string) => void;
  /** Codes of the types the client's package includes. */
  packageTypes?: string[];
  /** Kept shots per type code. */
  counts?: Record<string, number>;
  onEditMenu?: () => void;
  disabled?: boolean;
}> = ({ listing, current, onChange, packageTypes = [], counts = {}, onEditMenu, disabled }) => {
  const types = menuTypes(listing);
  const offMenu = packageTypes.filter((code) => !types.some((type) => type.code === code));
  return (
    <div className="border border-line bg-obsidian-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-ink">
          <Tags className="size-3.5 text-gold" aria-hidden="true" /> Next shots are
        </p>
        {onEditMenu && (
          <button type="button" onClick={onEditMenu}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-gold underline cursor-pointer">
            <ListChecks className="size-3.5" aria-hidden="true" /> My menu
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Shot type of the next shots" className="mt-2 flex flex-wrap gap-2">
        {types.map((type) => (
          <TypeButton key={type.id} type={type} active={current === type.code} disabled={disabled}
            inPackage={packageTypes.includes(type.code)} count={counts[type.code] ?? 0} onClick={() => onChange(type.code)} />
        ))}
        <button type="button" role="radio" aria-checked={current === ''} disabled={disabled} onClick={() => onChange('')}
          className={`min-h-11 border px-3 text-[11px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 ${current === ''
            ? 'border-gold bg-gold text-on-gold' : 'border-line text-neutral-600'}`}>
          No type
        </button>
      </div>
      {types.length === 0 && (
        <p className="m-0 mt-2 text-[11px] text-neutral-600">No shot types are turned on. The admin adds them in Camera Import → Shot types.</p>
      )}
      {offMenu.length > 0 && (
        <p className="m-0 mt-2 text-[11px] text-neutral-600">
          Also in this package (another photographer's menu): {offMenu.map((code) => listing?.types.find((type) => type.code === code)?.name ?? code).join(', ')}.
        </p>
      )}
    </div>
  );
};

function TypeButton({ type, active, inPackage, count, disabled, onClick }: {
  type: ShotType; active: boolean; inPackage: boolean; count: number; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      title={inPackage ? 'In this client’s package' : undefined}
      className={`relative min-h-11 border px-3 text-left text-[11px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 ${active
        ? 'border-gold bg-gold text-on-gold' : inPackage ? 'border-gold text-ink' : 'border-line text-ink'}`}>
      <span className="block">{type.name}</span>
      {(inPackage || count > 0) && (
        <span className={`mt-0.5 flex items-center gap-1 font-mono text-[9px] normal-case tracking-normal ${active ? 'text-on-gold' : 'text-neutral-600'}`}>
          {inPackage && (count > 0 ? <Check className="size-3 text-emerald-600" aria-hidden="true" /> : <span aria-hidden="true">●</span>)}
          {inPackage ? 'package' : ''}{count > 0 ? `${inPackage ? ' · ' : ''}${count} shot${count === 1 ? '' : 's'}` : ''}
        </span>
      )}
    </button>
  );
}

/** The photographer chooses which shot types their menu shows (their designation). */
export const ShotMenuModal: React.FC<{ listing: ShotTypeListing; onSaved: () => void; onClose: () => void }> = ({ listing, onSaved, onClose }) => {
  const { toast } = useToast();
  const active = listing.types.filter((type) => type.active);
  const [chosen, setChosen] = useState(() => new Set(listing.menu));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setChosen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const save = async () => {
    setBusy(true);
    try {
      await saveShotMenu(active.filter((type) => chosen.has(type.id)).map((type) => type.id));
      toast.success('Your shot menu is saved.');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="My shot menu" subtitle="The shot types you take. Only these show on your Photo Floor." icon={ListChecks}
      size="md" busy={busy} onClose={onClose}
      footer={<div className="flex justify-end gap-2">
        <button type="button" disabled={busy} onClick={onClose}
          className="btn-tactile min-h-11 border border-line px-4 text-xs font-black uppercase tracking-wider text-ink">Cancel</button>
        <button type="button" disabled={busy} onClick={() => void save()}
          className="btn-tactile min-h-11 bg-gold px-5 text-xs font-black uppercase tracking-wider text-on-gold disabled:opacity-50">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>}>
      <div className="space-y-2">
        <label className="flex min-h-11 items-center gap-3 border border-red-400 px-3">
          <input type="checkbox" checked disabled className="size-4" />
          <span className="text-sm font-bold text-red-700">Delete</span>
          <span className="ml-auto text-[10px] text-neutral-600">always on the menu</span>
        </label>
        {active.map((type) => (
          <label key={type.id} className="flex min-h-11 items-center gap-3 border border-line px-3 cursor-pointer">
            <input type="checkbox" checked={chosen.has(type.id)} onChange={() => toggle(type.id)} className="size-4" />
            <span className="text-sm font-bold text-ink">{type.name}</span>
            <span className="ml-auto font-mono text-[10px] text-neutral-600">{type.code}</span>
          </label>
        ))}
        {active.length === 0 && <p className="text-sm text-neutral-600">No shot types are turned on yet.</p>}
        <p className="m-0 text-[11px] text-neutral-600">
          Tick only what you shoot, so each new shot is one tap: for example Toga with cap and Toga w/out cap, or Family,
          Barkada and Couple. With none ticked, your menu shows every shot type. Saved to your account, on any laptop.
        </p>
      </div>
    </Modal>
  );
};
