import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Database, Images, Lock, Palette, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { DataFeedback } from '../../../components/common/DataFeedback';

interface DevConSummary {
  clients: Record<string, number>;
  kept: Record<string, number>;
  photoRoot: string;
  photoFolders: number;
  confirmPhrase: string;
  chooserUnlimited: boolean;
  muaStationOff: boolean;
}

interface WipeResult {
  deleted: Record<string, number>;
  backup: string;
  photos: { movedTo: string; moved: number; failed: string[] } | null;
  fileErrors: string[];
}

const api = '/api/studioflow/devcon';
const label = 'block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5';
const input = 'w-full min-h-[42px] text-xs sm:text-sm px-3 py-2 border border-neutral-400 bg-canvas focus:bg-panel font-semibold';
const errorText = (err: unknown) =>
  (err as { response?: { message?: string } })?.response?.message || (err instanceof Error ? err.message : 'Something went wrong.');

const clientLabels: Record<string, string> = {
  registrations: 'Job orders / registrations',
  payments: 'Payments (OR receipts)',
  refunds: 'Refunds (RF slips)',
  cashier_confirmations: 'Cashier confirmations',
  mua_completions: 'Makeup completion logs',
  mua_assignment_events: 'MUA assignments',
  mua_payouts: 'MUA payouts',
  shot_origins: 'Which camera took each photo',
};
const keptLabels: Record<string, string> = {
  packages: 'Packages',
  add_ons: 'Add-ons',
  catalog_items: 'Single items',
  item_packages: 'Saved poses',
  organizations: 'Schools',
  courses: 'Courses',
  master_lists: 'Roster rows',
  session_types: 'Session types',
  users: 'Staff accounts',
  camera_stations: 'Cameras',
};

/** Admin → DEV CON: delete every client record (test data) while keeping the studio's setup. */
export const AdminDevConTab: React.FC = () => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<DevConSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [photos, setPhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WipeResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setSummary(await pb.send<DevConSummary>(api + '/summary', { method: 'GET' }));
    } catch (err) {
      console.error('Failed to load the system summary:', err);
      setLoadError('Could not load the system summary.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const phrase = summary?.confirmPhrase || 'DELETE ALL CLIENTS';
  const ready = !!password && confirm.trim() === phrase && !busy;

  const wipe = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      const done = await pb.send<WipeResult>(api + '/wipe-clients', { method: 'POST', body: { password, confirm: confirm.trim(), photos } });
      setResult(done);
      setPassword('');
      setConfirm('');
      toast.success(`Deleted ${done.deleted.registrations ?? 0} client records. Backup: ${done.backup}`);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const clientTotal = summary ? Object.values(summary.clients).reduce((sum, n) => sum + n, 0) : 0;

  const [switching, setSwitching] = useState(false);
  const setOverride = async (on: boolean) => {
    setSwitching(true);
    try {
      await pb.send(api + '/chooser-override', { method: 'POST', body: { on } });
      setSummary((current) => current && { ...current, chooserUnlimited: on });
      toast.success(on ? 'Chooser photo limit override is ON: no selection limit.' : 'Chooser photo limit override is OFF: package limits apply again.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSwitching(false);
    }
  };
  const overrideOn = !!summary?.chooserUnlimited;

  const [muaSwitching, setMuaSwitching] = useState(false);
  const setMuaStation = async (off: boolean) => {
    setMuaSwitching(true);
    try {
      const result = await pb.send<{ muaStationOff: boolean; released: number }>(api + '/mua-station', { method: 'POST', body: { off } });
      setSummary((current) => current && { ...current, muaStationOff: off });
      toast.success(off
        ? `MUA station is OFF: clients with makeup go straight to the photographers.${result.released ? ` ${result.released} waiting client${result.released === 1 ? '' : 's'} sent to the Photo Floor.` : ''}`
        : 'MUA station is ON: clients with makeup wait for an artist again.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setMuaSwitching(false);
    }
  };
  const muaOff = !!summary?.muaStationOff;

  return (
    <div className="space-y-6 animate-enter">
      <div className={`bg-panel border-2 shadow-lux p-6 ${overrideOn ? 'border-amber-500' : 'border-line'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Images className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">Chooser Photo Limit Override</h3>
              <p className="text-[11px] text-neutral-600 mt-1 mb-0">
                While ON, the Photo Chooser can select as many photos as the client wants, for every client, ignoring the
                package's photo selection limit. Switch it OFF to go back to the package limits.
              </p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={overrideOn} disabled={!summary || switching}
            onClick={() => void setOverride(!overrideOn)}
            className={`btn-tactile shrink-0 min-h-[44px] px-5 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 ${
              overrideOn ? 'bg-amber-500 text-black' : 'bg-obsidian text-gold'}`}>
            {switching ? 'Saving…' : overrideOn ? 'Override ON · tap to turn off' : 'Override OFF · tap to turn on'}
          </button>
        </div>
      </div>

      <div className={`bg-panel border-2 shadow-lux p-6 ${muaOff ? 'border-amber-500' : 'border-line'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Palette className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">MUA Station</h3>
              <p className="text-[11px] text-neutral-600 mt-1 mb-0">
                While OFF, clients whose order has makeup or grooming skip the MUA queue and go straight to the photographers
                after paying. Turning it off also sends the clients waiting for an artist to the Photo Floor (anyone an artist
                already started stays with that artist). The MUA money is unchanged: it stays on the order, the ledger and every
                MUA total, but no artist is credited for it. MUA Payouts shows it in the shared MUA money total.
              </p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={!muaOff} disabled={!summary || muaSwitching}
            onClick={() => void setMuaStation(!muaOff)}
            className={`btn-tactile shrink-0 min-h-[44px] px-5 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 ${
              muaOff ? 'bg-amber-500 text-black' : 'bg-obsidian text-gold'}`}>
            {muaSwitching ? 'Saving…' : muaOff ? 'MUA station OFF · tap to turn on' : 'MUA station ON · tap to turn off'}
          </button>
        </div>
      </div>

      <div className="bg-panel border-2 border-red-600 shadow-lux p-6">
        <div className="flex items-start gap-3 pb-3 border-b-2 border-line mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink m-0">DEV CON · Delete All Client Records</h3>
            <p className="text-[11px] text-neutral-600 mt-1 mb-0">
              For clearing test registrations before the studio goes live. Deletes every client and what was recorded for them.
              The studio's setup is kept. Numbering starts again at Job Order 00001, receipt OR-000001 and queue #001.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="btn-tactile ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <DataFeedback loading={loading && !summary} refreshing={loading && !!summary} error={loadError} onRetry={load}
          loadingMessage="Loading system summary…" className="mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="border border-red-300 bg-red-50 p-4">
            <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-red-700 m-0 mb-2">
              <Trash2 className="w-4 h-4" /> Will be deleted
            </h4>
            <ul className="text-xs space-y-1 m-0 p-0 list-none">
              {Object.entries(clientLabels).map(([key, text]) => (
                <li key={key} className="flex justify-between gap-2"><span>{text}</span><span className="font-mono font-black">{summary?.clients[key] ?? '–'}</span></li>
              ))}
              <li className="flex justify-between gap-2"><span>Client signatures (uploaded files)</span><span className="font-mono">all</span></li>
            </ul>
          </section>
          <section className="border border-emerald-300 bg-emerald-50 p-4">
            <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-700 m-0 mb-2">
              <ShieldCheck className="w-4 h-4" /> Kept, not touched
            </h4>
            <ul className="text-xs space-y-1 m-0 p-0 list-none">
              {Object.entries(keptLabels).map(([key, text]) => (
                <li key={key} className="flex justify-between gap-2"><span>{text}</span><span className="font-mono font-black">{summary?.kept[key] ?? '–'}</span></li>
              ))}
              <li className="flex justify-between gap-2"><span>Studio settings, MUA services & team</span><span className="font-mono">kept</span></li>
            </ul>
          </section>
        </div>

        <p className="flex items-start gap-2 text-[11px] text-neutral-600 mt-4 mb-0">
          <Database className="w-4 h-4 shrink-0" />
          A full backup of the database is made first (dashboard → Settings → Backups, file <span className="font-mono">devcon_before_reset_….zip</span>).
          If the backup fails, nothing is deleted.
        </p>
      </div>

      <form onSubmit={wipe} className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
        <label className="flex items-start gap-3 text-xs cursor-pointer">
          <input type="checkbox" checked={photos} onChange={(event) => setPhotos(event.target.checked)} className="mt-0.5 w-4 h-4 accent-red-600" />
          <span>
            <span className="font-black uppercase tracking-wider text-ink">Also clear the client photo folders</span>
            <span className="block text-neutral-600 mt-0.5">
              Moves the {summary?.photoFolders ?? '—'} folder(s) in <span className="font-mono">{summary?.photoRoot || '…'}</span> into
              a <span className="font-mono">…_DEVCON_&lt;date&gt;</span> folder beside it (not deleted, so new job orders don't meet old folders).
              Delete that folder yourself when you no longer need it.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="devcon-password" className={label}><Lock className="inline w-3.5 h-3.5 mr-1" />Your admin password</label>
            <input id="devcon-password" type="password" autoComplete="current-password" value={password}
              onChange={(event) => setPassword(event.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="devcon-confirm" className={label}>Type <span className="font-mono text-red-700">{phrase}</span></label>
            <input id="devcon-confirm" autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value)}
              placeholder={phrase} className={`${input} font-mono`} />
          </div>
        </div>

        <button type="submit" disabled={!ready}
          className="btn-tactile w-full sm:w-auto min-h-[44px] px-5 flex items-center justify-center gap-2 bg-red-600 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          <Trash2 className="w-4 h-4" />
          {busy ? 'Backing up and deleting…' : `Delete all client records${summary ? ` (${clientTotal})` : ''}`}
        </button>
      </form>

      {result && (
        <div className="bg-panel border-2 border-emerald-600 shadow-lux p-6 text-xs space-y-2">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-700 m-0">Done</h4>
          <p className="m-0">Deleted {result.deleted.registrations ?? 0} job orders, {result.deleted.payments ?? 0} payments and {result.deleted.refunds ?? 0} refunds.</p>
          <p className="m-0">Backup: <span className="font-mono">{result.backup}</span></p>
          {result.photos && (
            <p className="m-0">
              {result.photos.moved
                ? <>Moved {result.photos.moved} photo folder(s) to <span className="font-mono">{result.photos.movedTo}</span>.</>
                : 'There were no photo folders to move.'}
            </p>
          )}
          {!!result.photos?.failed.length && (
            <p className="m-0 text-red-700">Could not move (close File Explorer or the photo viewer and move them by hand): {result.photos.failed.join('; ')}</p>
          )}
          {!!result.fileErrors.length && <p className="m-0 text-red-700">Some signature files could not be removed: {result.fileErrors.join('; ')}</p>}
          <button type="button" onClick={() => window.location.reload()}
            className="btn-tactile mt-2 px-4 py-2 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer">
            Reload StudioFlow
          </button>
        </div>
      )}
    </div>
  );
};
