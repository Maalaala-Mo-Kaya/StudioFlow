import React, { useEffect, useState } from 'react';
import { GraduationCap, Camera, MapPin, Plus, Save, ScrollText, Sparkles } from 'lucide-react';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { useStudioSettings } from '../../../hooks/useStudioSettings';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { Modal } from '../../../components/common/Modal';
import type { SessionType } from '../../../types';

const label = 'block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5';
const input = 'w-full min-h-[42px] text-xs sm:text-sm px-3 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-semibold';
const errorText = (err: unknown) =>
  (err as { response?: { message?: string } })?.response?.message || (err instanceof Error ? err.message : 'Something went wrong.');

const blankSession = { name: '', code: '', on_location: false, is_active: true };

/** Admin: who the kiosk accepts (school / walk-in), the preferred makeup look question, walk-in session types and terms. */
export const AdminClientTypesTab: React.FC = () => {
  const { toast } = useToast();
  const studio = useStudioSettings();
  const { settings, sessionTypes } = studio;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankSession);
  const [editingId, setEditingId] = useState('');
  // Editing has its own copy, so the "New session" form stays ready while the popup is open.
  const [editForm, setEditForm] = useState(blankSession);
  const [deleting, setDeleting] = useState<SessionType | null>(null);
  const [terms, setTerms] = useState('');
  const [termsDirty, setTermsDirty] = useState(false);

  useEffect(() => {
    if (!termsDirty) setTerms(studio.walkinTerms.join('\n'));
  }, [studio.walkinTerms, termsDirty]);

  const saveSettings = async (changes: Record<string, unknown>, message: string) => {
    if (!settings) return;
    setSaving(true);
    try {
      await pb.collection('studio_settings').update(settings.id, changes);
      await studio.refresh();
      toast.success(message);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: 'school_enabled' | 'walkin_enabled', value: boolean) => {
    const other = field === 'school_enabled' ? studio.walkinEnabled : studio.schoolEnabled;
    if (!value && !other) {
      toast.error('Keep at least one type of client switched on, or the kiosk cannot take registrations.');
      return;
    }
    const name = field === 'school_enabled' ? 'School registrations' : 'Walk-in clients';
    void saveSettings({ [field]: value }, `${name} ${value ? 'switched ON' : 'switched OFF'}.`);
  };

  const saveTerms = async () => {
    const clauses = terms.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!clauses.length) {
      toast.error('Enter at least one clause.');
      return;
    }
    await saveSettings({ walkin_terms: clauses }, 'Walk-in terms saved.');
    setTermsDirty(false);
  };

  const saveSession = async (event: React.FormEvent, id = '') => {
    event.preventDefault();
    const values = id ? editForm : form;
    if (!values.name.trim()) return;
    setSaving(true);
    try {
      const data = { ...values, name: values.name.trim(), code: values.code.trim().toUpperCase() };
      if (id) await pb.collection('session_types').update(id, data);
      else await pb.collection('session_types').create({ ...data, order: sessionTypes.length + 1 });
      toast.success(id ? 'Session type saved.' : `Session type "${data.name}" added.`);
      if (id) setEditingId(''); else setForm(blankSession);
      await studio.refresh();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const removeSession = async () => {
    if (!deleting) return;
    try {
      await pb.collection('session_types').delete(deleting.id);
      toast.success(`Session type "${deleting.name}" removed.`);
      await studio.refresh();
    } catch (err) {
      // Session types that clients already booked can't be deleted; switch them off instead.
      toast.error('This session type is used by existing job orders. Switch it off instead.');
      throw err;
    }
  };

  return (
    <div className="space-y-6 animate-enter">
      {/* Switches */}
      <div className="bg-panel border-2 border-line shadow-lux p-6">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0 pb-3 border-b-2 border-line mb-4">
          Who Can Register at the Kiosk
        </h3>
        {!settings && studio.loaded ? (
          <p className="text-xs text-red-700">Studio settings were not found. Restart the server so the latest update is applied.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Switch
              Icon={GraduationCap}
              title="School / Graduation"
              hint="Students register through their school, level and course."
              on={studio.schoolEnabled}
              disabled={saving || !settings}
              onChange={(value) => toggle('school_enabled', value)}
            />
            <Switch
              Icon={Camera}
              title="Walk-in Clients"
              hint="Family and personal portraits, and events outside the studio. Switch on only when the studio accepts walk-ins."
              on={studio.walkinEnabled}
              disabled={saving || !settings}
              onChange={(value) => toggle('walkin_enabled', value)}
            />
          </div>
        )}
        <p className="mt-3 text-[11px] text-neutral-500">
          With both switched on, the kiosk asks the client which type they are. With one switched on, the kiosk shows only that form.
          Changes apply to the kiosk right away.
        </p>
      </div>

      {/* Preferred makeup look */}
      <div className="bg-panel border-2 border-line shadow-lux p-6">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0 pb-3 border-b-2 border-line mb-4">
          Preferred Makeup Look at the Kiosk
        </h3>
        {settings && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Switch
              Icon={Sparkles}
              title="Ask School Clients"
              hint="Students choose Full makeup, Light / natural or Grooming only. To skip one school, edit it in Schools & Courses."
              on={!!settings.makeup_look_school}
              disabled={saving}
              onChange={(value) => void saveSettings({ makeup_look_school: value }, `Preferred look for school clients ${value ? 'switched ON' : 'switched OFF'}.`)}
            />
            <Switch
              Icon={Sparkles}
              title="Ask Walk-in Clients"
              hint="To skip one session type (e.g. ID / Passport Photo), use its Look button below."
              on={!!settings.makeup_look_walkin}
              disabled={saving}
              onChange={(value) => void saveSettings({ makeup_look_walkin: value }, `Preferred look for walk-in clients ${value ? 'switched ON' : 'switched OFF'}.`)}
            />
          </div>
        )}
        <p className="mt-3 text-[11px] text-neutral-500">
          Asked only when the package or an add-on includes makeup / grooming. The choice and the client&apos;s note show on the MUA station.
          Admins can change them in Edit Client.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Session types */}
        <div className="bg-panel border-2 border-line shadow-lux p-6">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0 pb-3 border-b-2 border-line mb-4">
            Walk-in Session Types ({sessionTypes.length})
          </h3>
          <form onSubmit={saveSession} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end mb-4">
            <div className="sm:col-span-3">
              <label htmlFor="session-name" className={label}>New Session <span className="text-red-600">*</span></label>
              <input id="session-name" required maxLength={80} placeholder="Family Portrait" value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor="session-code" className={label}>Code</label>
              <input id="session-code" maxLength={20} placeholder="FAM" value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })} className={`${input} uppercase`} />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 min-h-[42px] text-[11px] font-bold text-ink cursor-pointer">
              <input type="checkbox" checked={form.on_location} onChange={(event) => setForm({ ...form, on_location: event.target.checked })}
                className="w-4 h-4 accent-[var(--color-gold)]" />
              Outside the studio (asks date &amp; venue)
            </label>
            <div className="sm:col-span-6 flex gap-2">
              <button type="submit" disabled={saving}
                className="btn-tactile flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                <Plus className="w-4 h-4" /> Add Session
              </button>
            </div>
          </form>
          <ul className="space-y-2">
            {sessionTypes.map((type) => (
              <li key={type.id} className={`flex flex-wrap items-center justify-between gap-3 border p-3 ${editingId === type.id ? 'border-gold bg-gold-wash' : 'border-neutral-300 bg-canvas'}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-sm uppercase text-ink">{type.name}</span>
                    {type.code && <span className="font-mono text-[10px] text-neutral-500">{type.code}</span>}
                    {type.on_location && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 border border-neutral-400 text-neutral-600">
                        <MapPin className="w-3 h-3" /> On location
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                  <button type="button" disabled={saving}
                    onClick={async () => {
                      try {
                        await pb.collection('session_types').update(type.id, { is_active: !type.is_active });
                        await studio.refresh();
                      } catch (err) { toast.error(errorText(err)); }
                    }}
                    className={`btn-tactile px-2 py-1 text-[10px] font-black uppercase border cursor-pointer ${
                      type.is_active ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-neutral-300 text-neutral-500 bg-neutral-100'
                    }`}>
                    {type.is_active ? 'Offered' : 'Off'}
                  </button>
                  <button type="button" disabled={saving}
                    title={type.makeup_look_off ? 'The kiosk does not ask these clients for a preferred look' : 'The kiosk asks these clients for a preferred look'}
                    aria-pressed={!type.makeup_look_off}
                    onClick={async () => {
                      try {
                        await pb.collection('session_types').update(type.id, { makeup_look_off: !type.makeup_look_off });
                        await studio.refresh();
                      } catch (err) { toast.error(errorText(err)); }
                    }}
                    className={`btn-tactile px-2 py-1 text-[10px] font-black uppercase border cursor-pointer ${
                      type.makeup_look_off ? 'border-neutral-300 text-neutral-500 bg-neutral-100' : 'border-gold text-gold-soft bg-gold-wash'
                    }`}>
                    {type.makeup_look_off ? 'No look' : 'Look'}
                  </button>
                  <span className={recordActionGroup}>
                    <RecordActionButton variant="edit" recordName={type.name} onClick={() => {
                      setEditingId(type.id);
                      setEditForm({ name: type.name, code: type.code || '', on_location: !!type.on_location, is_active: !!type.is_active });
                    }} />
                    <RecordActionButton variant="delete" recordName={type.name} onClick={() => setDeleting(type)} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {editingId && (
            <Modal title="Edit session type" subtitle={sessionTypes.find((t) => t.id === editingId)?.name} icon={Camera} size="md"
              busy={saving} onClose={() => setEditingId('')}>
              <form onSubmit={(event) => void saveSession(event, editingId)} className="space-y-3">
                <div>
                  <label htmlFor="edit-session-name" className={label}>Session name <span className="text-red-600">*</span></label>
                  <input id="edit-session-name" required maxLength={80} autoFocus value={editForm.name}
                    onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className={input} />
                </div>
                <div>
                  <label htmlFor="edit-session-code" className={label}>Code</label>
                  <input id="edit-session-code" maxLength={20} value={editForm.code}
                    onChange={(event) => setEditForm({ ...editForm, code: event.target.value })} className={`${input} uppercase`} />
                </div>
                <label className="flex items-center gap-2 min-h-[42px] text-[11px] font-bold text-ink cursor-pointer">
                  <input type="checkbox" checked={editForm.on_location} onChange={(event) => setEditForm({ ...editForm, on_location: event.target.checked })}
                    className="w-4 h-4 accent-[var(--color-gold)]" />
                  Outside the studio (asks date &amp; venue)
                </label>
                <div className="flex justify-end gap-2 pt-2 border-t border-line">
                  <button type="button" disabled={saving} onClick={() => setEditingId('')}
                    className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={saving || !editForm.name.trim()}
                    className="btn-tactile min-h-[42px] px-5 inline-flex items-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                    <Save className="w-4 h-4" /> Save Session
                  </button>
                </div>
              </form>
            </Modal>
          )}
        </div>

        {/* Walk-in terms */}
        <div className="bg-panel border-2 border-line shadow-lux p-6 flex flex-col">
          <h3 className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0 pb-3 border-b-2 border-line mb-4">
            <ScrollText className="w-4 h-4 text-gold-soft" /> Walk-in Terms &amp; Conditions
          </h3>
          <p className="text-[11px] text-neutral-500 mb-2">
            One clause per line. Shown at the kiosk for walk-in clients and printed on their claim stub. School clients keep the graduation terms.
          </p>
          <textarea value={terms} rows={12} onChange={(event) => { setTerms(event.target.value); setTermsDirty(true); }}
            className="flex-1 w-full text-xs leading-relaxed px-3 py-2 border border-neutral-400 bg-canvas focus:bg-panel" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void saveTerms()} disabled={saving || !termsDirty || !settings}
              className="btn-tactile flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
              <Save className="w-4 h-4" /> Save Terms
            </button>
            {termsDirty && (
              <button type="button" onClick={() => setTermsDirty(false)}
                className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer">Undo</button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleting}
        title="Remove Session Type"
        message={<>Remove <strong>{deleting?.name}</strong>? A session type already used by job orders can only be switched off.</>}
        confirmText="Remove"
        isDestructive
        onConfirm={removeSession}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

const Switch: React.FC<{
  Icon: typeof Camera; title: string; hint: string; on: boolean; disabled: boolean; onChange: (value: boolean) => void;
}> = ({ Icon, title, hint, on, disabled, onChange }) => (
  <div className={`flex items-start gap-3 border-2 p-4 ${on ? 'border-line bg-gold-wash' : 'border-neutral-300 bg-canvas'}`}>
    <span className={`w-10 h-10 shrink-0 flex items-center justify-center ${on ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'}`}>
      <Icon className="w-5 h-5" />
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-black uppercase text-ink">{title}</div>
      <p className="text-[11px] text-neutral-600 mt-0.5">{hint}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${title}: ${on ? 'on' : 'off'}`}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`btn-tactile shrink-0 min-w-[64px] min-h-[36px] px-3 border-2 text-xs font-black uppercase cursor-pointer disabled:opacity-50 ${
        on ? 'bg-emerald-600 border-emerald-700 text-white' : 'bg-neutral-200 border-neutral-400 text-neutral-700'
      }`}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  </div>
);
