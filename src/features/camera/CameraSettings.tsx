import React, { useState } from 'react';
import { Aperture, FolderSearch, Pencil, Plus, Save } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { RecordActionButton, recordActionGroup } from '../../components/common/RecordActionButton';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useWorkflowData, workflowError } from '../../hooks/useWorkflowData';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { formatJobOrderNo } from '../../utils/formatters';
import { FolderPickerModal } from './FolderPickerModal';
import { sinceLabel, type CameraConfig, type CameraStatus } from './cameraApi';

const blank: CameraConfig = { name: '', watch_folder: '', enabled: true, include_subfolders: false, import_raw: false };
const label = 'block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5';
const input = 'w-full min-h-[44px] text-xs sm:text-sm px-3.5 py-2 border border-neutral-400 bg-canvas focus:bg-panel';

/** Camera hot-folder configuration. Used in Admin and on the Photo Floor. */
export const CameraSettings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: stations, refresh } = useWorkflowData<CameraStatus[]>('/camera');
  const [form, setForm] = useState<CameraConfig>(blank);
  // Editing has its own copy (in a popup), so the "Add Camera" form stays ready.
  const [editForm, setEditForm] = useState<CameraConfig>(blank);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  // Which form the folder picker fills.
  const [picking, setPicking] = useState<'add' | 'edit' | null>(null);
  const [deleting, setDeleting] = useState<CameraStatus | null>(null);
  const isAdmin = user?.role === 'admin';

  const set = <K extends keyof CameraConfig>(key: K, value: CameraConfig[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setEdit = <K extends keyof CameraConfig>(key: K, value: CameraConfig[K]) => setEditForm((current) => ({ ...current, [key]: value }));

  const edit = (station: CameraStatus) => {
    setEditingId(station.id);
    setEditForm({
      name: station.name, watch_folder: station.watchFolder, enabled: station.enabled,
      include_subfolders: station.includeSubfolders, import_raw: station.importRaw,
    });
  };
  const closeEdit = () => setEditingId('');

  const save = async (event: React.FormEvent, id = '') => {
    event.preventDefault();
    setSaving(true);
    try {
      const cameras = pb.collection('camera_stations');
      if (id) await cameras.update(id, editForm);
      else await cameras.create(form);
      toast.success(id ? 'Camera settings saved.' : `Camera "${form.name.trim()}" added.`);
      if (id) closeEdit(); else setForm(blank);
      refresh();
    } catch (err) {
      toast.error(workflowError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await pb.collection('camera_stations').delete(deleting.id);
      toast.success(`Camera "${deleting.name}" removed.`);
      if (editingId === deleting.id) closeEdit();
      refresh();
    } catch (err) {
      toast.error(workflowError(err));
      throw err;
    }
  };

  /** The camera fields, shared by the Add form and the Edit popup. */
  const fields = (values: CameraConfig, update: typeof set, prefix: string) => (
    <>
            <div>
              <label htmlFor={`${prefix}-name`} className={label}>Camera Name <span className="text-red-600">*</span></label>
              <input id={`${prefix}-name`} required maxLength={60} placeholder="Booth 1 — Canon R6" value={values.name}
                onChange={(event) => update('name', event.target.value)} className={`${input} font-semibold`} />
            </div>

            <div>
              <label htmlFor={`${prefix}-folder`} className={label}>Camera Output Folder (on the server PC) <span className="text-red-600">*</span></label>
              <div className="flex gap-2">
                <input id={`${prefix}-folder`} required placeholder="C:\StudioFlow_Incoming\Camera1" value={values.watch_folder}
                  onChange={(event) => update('watch_folder', event.target.value)} className={`${input} font-mono`} />
                <button type="button" onClick={() => setPicking(prefix === 'camera' ? 'add' : 'edit')}
                  className="btn-tactile shrink-0 inline-flex items-center gap-1.5 px-3.5 bg-obsidian text-gold text-[11px] font-black uppercase tracking-wider cursor-pointer">
                  <FolderSearch className="w-4 h-4" /> Browse
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-500">
                Set this same folder as the save/output folder in the camera's tethering or transfer software.
              </p>
            </div>

            <fieldset className="space-y-2.5">
              <legend className={label}>Options</legend>
              <Toggle checked={values.enabled} onChange={(value) => update('enabled', value)}
                title="Camera is on" hint="Turn off to pause importing from this folder." />
              <Toggle checked={values.include_subfolders} onChange={(value) => update('include_subfolders', value)}
                title="Look inside subfolders" hint="For software that saves into dated folders (e.g. EOS Utility, card readers)." />
              <Toggle checked={values.import_raw} onChange={(value) => update('import_raw', value)}
                title="Also import RAW files" hint="CR2, CR3, NEF, ARW, RAF, DNG… go to the client's RAW folder. The chooser only shows JPEG/PNG." />
            </fieldset>
    </>
  );
  const editing = editingId ? stations?.find((station) => station.id === editingId) : undefined;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-enter">
      <div className="space-y-6">
        <form onSubmit={save} className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b-2 border-line">
            <div className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">
                Add Camera
              </h3>
              <p className="text-[11px] text-neutral-500">The folder the system watches for new photos.</p>
            </div>
          </div>

          {fields(form, set, 'camera')}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving}
              className="btn-tactile flex-1 min-h-[46px] inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
              <Plus className="w-4 h-4" /> {saving && !editingId ? 'Saving…' : 'Add Camera'}
            </button>
          </div>
        </form>

        <div className="bg-panel border-2 border-line shadow-lux p-6 text-xs text-neutral-700 space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-ink m-0 mb-2">How it works</h3>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>Point the camera software (EOS Utility, Lightroom, Capture One, Nikon tether, Wi-Fi/FTP transfer…) at the folder above.</li>
            <li>On the Photo Floor, the photographer picks this camera under <strong>Camera Auto-Import</strong>.</li>
            <li>Pressing <strong>Call Client</strong> links the camera to that client. Every finished shot moves into the client's folder within a few seconds.</li>
            <li><strong>Mark Done</strong> sends the last shots and unlinks the camera. Shots taken with no client linked stay in the camera folder.</li>
          </ol>
          <p className="text-neutral-500 pt-1">
            If the camera is tethered to a different PC, share this folder on the network and save to that share.
            The camera folder must be separate from the client photo folders.
          </p>
        </div>
      </div>

      <div className="bg-panel border-2 border-line shadow-lux p-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-line mb-4">
          <div className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center shrink-0">
            <Aperture className="w-4 h-4" />
          </div>
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">Cameras ({stations?.length ?? 0})</h3>
        </div>
        {!stations?.length ? (
          <p className="text-xs text-neutral-500 py-8 text-center">No cameras yet. Add the first one on the left.</p>
        ) : (
          <ul className="space-y-3">
            {stations.map((station) => (
              <li key={station.id} className={`border p-4 ${editingId === station.id ? 'border-gold bg-gold-wash' : 'border-neutral-300 bg-canvas'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black uppercase text-sm text-ink">{station.name}</span>
                      <Badge tone={!station.enabled ? 'grey' : station.folderOk ? 'green' : 'red'}>
                        {!station.enabled ? 'Off' : station.folderOk ? 'Watching' : 'Folder missing'}
                      </Badge>
                      {station.includeSubfolders && <Badge tone="grey">Subfolders</Badge>}
                      {station.importRaw && <Badge tone="grey">RAW</Badge>}
                    </div>
                    <div className="font-mono text-[11px] text-neutral-500 truncate mt-1" title={station.watchFolder}>{station.watchFolder}</div>
                  </div>
                  <div className={recordActionGroup}>
                    <RecordActionButton variant="edit" recordName={station.name} onClick={() => edit(station)} />
                    {isAdmin && (
                      <RecordActionButton variant="delete" recordName={station.name} onClick={() => setDeleting(station)} />
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-300 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-neutral-600">
                  <span>
                    Linked client:{' '}
                    <strong className="text-ink">
                      {station.client ? `${station.client.name} ${formatJobOrderNo(station.client.jobOrder)}` : 'none'}
                    </strong>
                  </span>
                  <span>Imported this session: <strong className="text-ink">{station.sessionImported}</strong></span>
                  <span>Unassigned in folder: <strong className={station.waiting ? 'text-amber-700' : 'text-ink'}>{station.waiting}</strong></span>
                  <span>Last checked: <strong className="text-ink">{sinceLabel(station.lastScan)}</strong></span>
                </div>
                {station.lastError && <p className="mt-2 text-[11px] text-red-700">{station.lastError}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editingId && (
        <Modal title="Edit camera" subtitle={editing?.name ?? editForm.name} icon={Pencil} size="md" busy={saving} onClose={closeEdit}>
          <form onSubmit={(event) => void save(event, editingId)} className="space-y-4">
            {fields(editForm, setEdit, 'edit-camera')}
            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button type="button" disabled={saving} onClick={closeEdit}
                className="btn-tactile min-h-[46px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="btn-tactile min-h-[46px] px-5 inline-flex items-center justify-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {picking && (
        <FolderPickerModal
          initialPath={picking === 'edit' ? editForm.watch_folder : form.watch_folder}
          onClose={() => setPicking(null)}
          onPick={(path) => { (picking === 'edit' ? setEdit : set)('watch_folder', path); setPicking(null); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deleting}
        title="Remove Camera"
        message={<>Remove <strong>{deleting?.name}</strong>? Photos already imported stay in the client folders; files still in the camera folder are not touched.</>}
        confirmText="Remove Camera"
        isDestructive
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
};

const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; title: string; hint: string }> = ({ checked, onChange, title, hint }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--color-gold)] shrink-0" />
    <span>
      <span className="block text-xs font-bold text-ink">{title}</span>
      <span className="block text-[11px] text-neutral-500">{hint}</span>
    </span>
  </label>
);

const Badge: React.FC<{ tone: 'green' | 'red' | 'grey'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`font-mono text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${
    tone === 'green' ? 'border-emerald-400 text-emerald-700 bg-emerald-50'
      : tone === 'red' ? 'border-red-300 text-red-700 bg-red-50'
        : 'border-neutral-300 text-neutral-600 bg-neutral-100'
  }`}>
    {children}
  </span>
);
