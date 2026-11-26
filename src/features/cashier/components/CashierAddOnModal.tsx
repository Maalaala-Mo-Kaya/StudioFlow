import { DataFeedback } from '../../../components/common/DataFeedback';
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import type { AddOn, Registration } from '../../../types';
import { Modal } from '../../../components/common/Modal';
import { useToast } from '../../../context/ToastContext';
import { formatClientName, formatCurrency, formatJobOrderNo } from '../../../utils/formatters';
import { getRegistrationAddOns } from '../../../utils/registrationAddOns';
import { isPhotographed } from '../../../utils/releaseReadiness';
import { isWalkIn } from '../../../utils/clientInfo';

/**
 * The cashier adds add-ons the client asks for at the counter (catalog price). Only additions:
 * removing or changing what is on the order stays with an administrator (the server enforces it).
 * Makeup can't be added once photography is done. An order already marked ready for pickup goes
 * back to In production so the new item gets made.
 */
export const CashierAddOnModal: React.FC<{
  registration: Registration;
  onClose: () => void;
  /** The saved order and the names of the add-ons added. */
  onSaved: (saved: Registration, added: string[]) => void;
}> = ({ registration: reg, onClose, onSaved }) => {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<AddOn[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const onOrder = useMemo(() => getRegistrationAddOns(reg.add_ons), [reg.add_ons]);
  const kind = isWalkIn(reg) ? 'walkin' : 'school';
  const photographed = isPhotographed(reg);
  const productionReady = ['completed', 'ready_for_pickup'].includes(reg.status)
    || ['framed', 'ready_for_pickup'].includes(reg.framing_status ?? '');

  useEffect(() => {
    let live = true;
    pb.collection('add_ons').getFullList<AddOn>({ filter: 'is_active = true', sort: 'name', requestKey: null })
      .then((list) => { if (live) setCatalog(list); })
      .catch((error) => {
        if (!live) return;
        console.error('Failed to load the cashier add-on catalog:', error);
        setCatalogError('Could not load available add-ons.');
      });
    return () => { live = false; };
  }, [attempt]);

  // Offered to this client, not already on the order, and not the automatic no-makeup add-on.
  const choices = (catalog ?? []).filter((add) => [kind, 'both'].includes(add.client_kind || 'both')
    && !add.default_when_no_mua && !onOrder.some((item) => item.id === add.id));
  const chosen = choices.filter((add) => picked.includes(add.id));
  const extra = chosen.reduce((sum, add) => sum + (add.amount || 0), 0);
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const save = async () => {
    if (!chosen.length) return;
    setSaving(true);
    try {
      const saved = await pb.collection('registrations').update<Registration>(reg.id, {
        add_ons: [
          ...onOrder.map((item) => (item.id ? { id: item.id } : { code: item.code, name: item.name })),
          ...chosen.map((add) => ({ id: add.id })),
        ],
      }, { expand: 'organization,level,course,package,session_type' });
      onSaved(saved, chosen.map((add) => add.name));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The add-on could not be added.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add to order" icon={Plus} size="md" busy={saving} onClose={onClose}
      subtitle={<>{formatClientName(reg)}{reg.job_order_no ? <> · JO {formatJobOrderNo(reg.job_order_no)}</> : null}</>}
      footer={<>
        <span className="mr-auto font-mono text-[11px] text-neutral-600">
          {chosen.length ? <>+{formatCurrency(extra, { exact: true })} · new balance <b className="text-ink">{formatCurrency((reg.balance || 0) + extra, { exact: true })}</b></> : 'Pick what the client wants to add'}
        </span>
        <button type="button" onClick={onClose} disabled={saving}
          className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer disabled:opacity-50">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || !chosen.length}
          className="btn-tactile min-h-[42px] px-5 inline-flex items-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
          <Check className="w-4 h-4" /> {saving ? 'Adding…' : `Add ${chosen.length || ''}`.trim()}
        </button>
      </>}>
      <div className="space-y-3">
        {productionReady && (
          <p role="status" className="p-2.5 border-2 border-amber-500 bg-amber-50 text-amber-900 font-sans text-[11px]">
            <b>This order is marked ready for pickup.</b> Adding an item moves it back to <b>In production</b> until an
            admin marks it ready again, so don&apos;t release it before the new item is made.
          </p>
        )}
        {onOrder.length > 0 && (
          <p className="font-sans text-[11px] text-neutral-600"><b>Already on the order:</b> {onOrder.map((item) => item.name).join(', ')}.</p>
        )}
        {catalog === null ? (
          <DataFeedback loading={!catalogError} error={catalogError} loadingMessage="Loading add-ons…"
            className="min-h-24 p-3" onRetry={() => { setCatalogError(''); setAttempt((value) => value + 1); }} />
        ) : !choices.length ? (
          <p className="text-neutral-500 font-sans">No other add-ons are offered to this client.</p>
        ) : (
          <ul className="space-y-1.5">
            {choices.map((add) => {
              // Makeup needs the shoot still ahead (the server refuses it afterwards).
              const blocked = photographed && add.requires_mua;
              const on = picked.includes(add.id);
              return (
                <li key={add.id}>
                  <label className={`flex items-center justify-between gap-3 min-h-[46px] px-3 py-2 border ${
                    blocked ? 'border-neutral-300 opacity-50 cursor-not-allowed' : on ? 'border-gold bg-gold-wash cursor-pointer' : 'border-line bg-canvas cursor-pointer hover:border-gold'
                  }`}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <input type="checkbox" checked={on} disabled={blocked} onChange={() => toggle(add.id)} className="w-4 h-4 accent-[var(--color-gold)] shrink-0" />
                      <span className="min-w-0">
                        <span className="block font-black uppercase text-ink truncate">{add.name}</span>
                        {blocked && <span className="block font-sans text-[10px] text-neutral-500">Photos are done: makeup can&apos;t be added now.</span>}
                      </span>
                    </span>
                    <span className="font-black text-gold-soft shrink-0">{formatCurrency(add.amount, { exact: true })}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="font-sans text-[10px] text-neutral-500">
          Removing or changing an item already on the order needs an administrator (Admin → Students → Edit).
        </p>
      </div>
    </Modal>
  );
};
