import React, { useState } from 'react';
import { Ban, FileSpreadsheet, HandCoins, Users, Wallet } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { useWorkflowData, workflowError } from '../../../hooks/useWorkflowData';
import { clampDay, useStudioCalendar } from '../../../hooks/useStudioCalendar';
import { Modal } from '../../../components/common/Modal';
import { formatCurrency } from '../../../utils/formatters';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { artistTotals, periodLabel, sharedTotals, type MuaArtistTotals, type MuaPayout, type MuaPayoutReport } from '../muaPayouts';

// Manila calendar days.
const manilaDay = (offsetDays = 0) => new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const monthStart = (day: string) => day.slice(0, 8) + '01';
const lastMonth = () => {
  const first = new Date(monthStart(manilaDay()) + 'T00:00:00Z');
  const end = new Date(first.getTime() - 86400000);
  return { from: end.toISOString().slice(0, 8) + '01', to: end.toISOString().slice(0, 10) };
};
const peso = (value: number) => formatCurrency(value, { exact: true });

/**
 * MUA payouts for a period: what each makeup artist earned (services completed in the period), what
 * the studio already paid out and what is still owed, plus the shared MUA money (Wardrobe …) that the
 * MUA team splits outside the system. Recording a payout ("Mark as paid") is optional.
 */
export const MuaPayoutsPanel: React.FC = () => {
  const { toast } = useToast();
  const today = manilaDay();
  const [range, setRange] = useState({ from: monthStart(today), to: today });
  // From the studio's first day to today.
  const { start } = useStudioCalendar();
  const within = (from: string, to: string) => ({ from: clampDay(from, start, today), to: clampDay(to, start, today) });
  const valid = range.from && range.to && range.from <= range.to;
  const { data: report, error, refresh } = useWorkflowData<MuaPayoutReport>(
    valid ? `/mua-payouts?from=${range.from}&to=${range.to}` : null);
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [paying, setPaying] = useState<MuaArtistTotals | null>(null);
  const [voiding, setVoiding] = useState<MuaPayout | null>(null);
  const [exporting, setExporting] = useState(false);

  const artists = report ? artistTotals(report.lines) : [];
  const pool = report ? sharedTotals(report.shared) : null;
  const open = artists.find((artist) => artist.artistId === openArtist);
  const period = periodLabel(range.from, range.to);
  const sum = (key: 'earned' | 'paid' | 'unpaid' | 'clientPaid') => artists.reduce((total, artist) => total + artist[key], 0);

  const exportExcel = async () => {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const { downloadMuaPayoutWorkbook } = await import('../muaPayoutSheets');
      await downloadMuaPayoutWorkbook(report, `${period} · services completed / orders made in this period`);
    } catch (err) {
      toast.error(workflowError(err));
    } finally { setExporting(false); }
  };

  return (
    <section className={`${stationCard} space-y-4`} aria-label="MUA payouts">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider"><HandCoins className="w-4 h-4 text-gold" /> MUA Payouts</h3>
          <p className="text-[11px] text-neutral-500">The client pays the studio; the studio pays the makeup artists. Services completed in the period.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold">
            <span className="block">From</span>
            <input type="date" value={range.from} min={start || undefined} max={range.to} onChange={(e) => setRange({ ...range, from: clampDay(e.target.value, start, range.to) })}
              className="min-h-10 border border-line bg-panel px-2" />
          </label>
          <label className="text-xs font-bold">
            <span className="block">To</span>
            <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => setRange({ ...range, to: clampDay(e.target.value, range.from, today) })}
              className="min-h-10 border border-line bg-panel px-2" />
          </label>
          <button type="button" className={`${stationButton} !bg-panel !text-ink`} onClick={() => setRange(within(monthStart(today), today))}>This month</button>
          <button type="button" className={`${stationButton} !bg-panel !text-ink`} disabled={!!start && lastMonth().to < start} onClick={() => { const last = lastMonth(); setRange(within(last.from, last.to)); }}>Last month</button>
          <button type="button" className={stationButton} disabled={!report || exporting} onClick={() => void exportExcel()}>
            <FileSpreadsheet className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {!valid && <p role="alert" className="text-sm text-red-700">Choose a From date on or before the To date.</p>}
      {valid && error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {valid && !report && !error && <p role="status" className="text-sm">Loading payouts…</p>}

      {valid && report && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {([
              ['Earned by artists', sum('earned')], ['Paid out', sum('paid')], ['Still owed', sum('unpaid')],
              ['Shared MUA money', pool?.total ?? 0],
            ] as const).map(([label, amount]) => (
              <div key={label} className="border-2 border-line bg-canvas p-3">
                <p className="text-[10px] font-black uppercase text-gold-soft">{label}</p>
                <p className={`font-mono text-lg font-black ${label === 'Still owed' && amount > 0 ? 'text-red-700' : 'text-ink'}`}>{peso(amount)}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border-2 border-line">
            <table className="w-full min-w-[720px] text-xs font-mono">
              <thead className="bg-obsidian text-gold text-[10px] uppercase">
                <tr>
                  {['Makeup artist', 'Clients', 'Services', 'Earned', 'Paid out', 'Unpaid', 'On fully paid orders', ''].map((label) => (
                    <th key={label} className={`p-2 ${label === 'Makeup artist' ? 'text-left' : 'text-right'}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {!artists.length && <tr><td colSpan={8} className="p-4 text-center text-neutral-500">No services completed in this period.</td></tr>}
                {artists.map((artist) => (
                  <tr key={artist.artistId} className="cursor-pointer hover:bg-gold-wash" onClick={() => setOpenArtist(artist.artistId)}>
                    <td className="p-2 font-black uppercase text-ink">
                      <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gold shrink-0" />{artist.artistName}</span>
                      {artist.review > 0 && <span className="block text-[10px] font-bold normal-case text-amber-700">{artist.review} need review</span>}
                    </td>
                    <td className="p-2 text-right">{artist.clients}</td>
                    <td className="p-2 text-right">{artist.services}</td>
                    <td className="p-2 text-right font-black">{peso(artist.earned)}</td>
                    <td className="p-2 text-right text-emerald-700">{peso(artist.paid)}</td>
                    <td className={`p-2 text-right font-black ${artist.unpaid > 0 ? 'text-red-700' : ''}`}>{peso(artist.unpaid)}</td>
                    <td className="p-2 text-right text-neutral-600">{peso(artist.clientPaid)}</td>
                    <td className="p-2 text-right" onClick={(event) => event.stopPropagation()}>
                      {artist.payable > 0 && (
                        <button type="button" onClick={() => setPaying(artist)}
                          className="btn-tactile min-h-[34px] px-3 inline-flex items-center gap-1.5 bg-gold text-on-gold border border-line text-[10px] font-black uppercase cursor-pointer whitespace-nowrap">
                          <Wallet className="w-3.5 h-3.5" /> Mark {peso(artist.payable)} paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pool && (
            <div className="border-2 border-line bg-canvas p-3 text-xs space-y-1">
              <p className="font-black uppercase text-ink">Shared MUA money · {peso(pool.total)}
                <span className="ml-2 font-mono font-bold normal-case text-neutral-500">({peso(pool.clientPaid)} on fully paid orders)</span></p>
              <p className="text-neutral-600 font-sans">
                MUA charges that are not one artist&apos;s service (e.g. Wardrobe), on job orders made in this period. The money is for the
                MUA team; they split it outside the system, so it is not credited to any artist.
              </p>
              {pool.byItem.length > 0 && <p className="font-mono">{pool.byItem.map(([item, amount]) => `${item} ${peso(amount)}`).join(' · ')}</p>}
            </div>
          )}

          {report.payouts.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-black uppercase text-ink">Payouts recorded in this period</h4>
              <ul className="divide-y divide-neutral-200 border border-line">
                {report.payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-xs font-mono">
                    <span className={payout.voidedAt ? 'line-through text-neutral-500' : 'text-ink'}>
                      <b>{payout.payoutNo}</b> · {payout.artistName} · {peso(payout.amount)} · {payout.lines.length} service{payout.lines.length === 1 ? '' : 's'}
                      {' '}· {payout.paidAt.slice(0, 10)} by {payout.paidBy}{payout.note ? ` · ${payout.note}` : ''}
                    </span>
                    {payout.voidedAt ? (
                      <span className="text-[10px] font-bold text-red-700">Voided: {payout.voidReason}</span>
                    ) : (
                      <button type="button" onClick={() => setVoiding(payout)}
                        className="inline-flex items-center gap-1 px-2 py-1 border border-red-400 text-red-700 text-[10px] font-black uppercase cursor-pointer hover:bg-red-50">
                        <Ban className="w-3 h-3" /> Void
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[10px] text-neutral-500 font-sans">
            Recording payouts is optional: the export works either way. A recorded payout marks the artist&apos;s unpaid services in the period as
            paid (MP-…), so they are not paid twice. Lines that need review are not included until an admin verifies them.
          </p>
        </>
      )}

      {open && (
        <Modal title={open.artistName} icon={Users} size="xl" onClose={() => setOpenArtist(null)}
          subtitle={<>{period} · earned {peso(open.earned)} · paid {peso(open.paid)} · unpaid {peso(open.unpaid)}</>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs font-mono">
              <thead className="text-[10px] uppercase text-gold-soft border-b-2 border-line">
                <tr>{['Date', 'Job order', 'Client', 'Service', 'Earned', 'Client paid', 'Payout'].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {open.lines.map((line) => (
                  <tr key={line.completionId}>
                    <td className="p-2">{line.date}</td>
                    <td className="p-2 font-black">{line.jobOrder}</td>
                    <td className="p-2">{line.client}<span className="block text-[10px] text-neutral-500">{line.group}</span></td>
                    <td className="p-2">{line.service}{line.review && <span className="block text-[10px] text-amber-700">{line.review}</span>}</td>
                    <td className="p-2 text-right font-black">{peso(line.earned)}</td>
                    <td className="p-2">{line.status === 'cancelled' ? 'Cancelled' : line.paidInFull ? 'Yes' : `No · ${peso(line.balance)} due`}</td>
                    <td className={`p-2 font-black ${line.payoutNo ? 'text-emerald-700' : 'text-red-700'}`}>{line.payoutNo || 'Unpaid'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {paying && report && (
        <PayoutModal artist={paying} from={report.from} to={report.to} period={period}
          onClose={() => setPaying(null)} onDone={() => { setPaying(null); refresh(); }} />
      )}
      {voiding && (
        <VoidPayoutModal payout={voiding} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); refresh(); }} />
      )}
    </section>
  );
};

const PayoutModal: React.FC<{ artist: MuaArtistTotals; from: string; to: string; period: string; onClose: () => void; onDone: () => void }> = ({
  artist, from, to, period, onClose, onDone,
}) => {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const lines = artist.lines.filter((line) => !line.payoutNo && !line.review && line.earned > 0);
  const save = async () => {
    setSaving(true);
    try {
      const payout = await pb.send<MuaPayout>('/api/studioflow/mua-payouts', {
        method: 'POST', body: { artistId: artist.artistId, from, to, note },
      });
      toast.success(`${payout.payoutNo}: ${peso(payout.amount)} paid to ${payout.artistName}.`);
      onDone();
    } catch (err) {
      toast.error(workflowError(err));
    } finally { setSaving(false); }
  };
  return (
    <Modal title="Record payout" subtitle={<>{artist.artistName} · {period}</>} icon={Wallet} size="md" busy={saving} onClose={onClose}
      footer={<>
        <button type="button" disabled={saving} onClick={onClose}
          className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer disabled:opacity-50">Cancel</button>
        <button type="button" disabled={saving || !lines.length} onClick={() => void save()}
          className="btn-tactile min-h-[42px] px-5 inline-flex items-center gap-2 bg-gold text-on-gold text-xs font-black uppercase cursor-pointer disabled:opacity-50">
          <Wallet className="w-4 h-4" /> {saving ? 'Saving…' : `Mark ${peso(artist.payable)} paid`}
        </button>
      </>}>
      <div className="space-y-3 text-xs">
        <p className="font-sans">Records that the studio paid <b>{artist.artistName}</b> for these {lines.length} service{lines.length === 1 ? '' : 's'}.
          They then show as paid, so they are not paid twice.</p>
        <ul className="max-h-56 overflow-y-auto divide-y divide-neutral-200 border border-line font-mono">
          {lines.map((line) => (
            <li key={line.completionId} className="flex justify-between gap-2 p-1.5">
              <span>{line.date} · {line.jobOrder} · {line.service}{!line.paidInFull && <span className="text-amber-700"> · client not fully paid</span>}</span>
              <b>{peso(line.earned)}</b>
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="block text-[11px] font-black uppercase mb-1">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Cash after the Nov 20 event"
            className="w-full min-h-[40px] px-3 border border-neutral-400 bg-canvas" />
        </label>
      </div>
    </Modal>
  );
};

const VoidPayoutModal: React.FC<{ payout: MuaPayout; onClose: () => void; onDone: () => void }> = ({ payout, onClose, onDone }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await pb.send(`/api/studioflow/mua-payouts/${payout.id}/void`, { method: 'POST', body: { reason } });
      toast.success(`${payout.payoutNo} voided. Its services are unpaid again.`);
      onDone();
    } catch (err) {
      toast.error(workflowError(err));
    } finally { setSaving(false); }
  };
  return (
    <Modal title={`Void ${payout.payoutNo}`} subtitle={<>{payout.artistName} · {peso(payout.amount)}</>} icon={Ban} size="md" busy={saving} onClose={onClose}
      footer={<>
        <button type="button" disabled={saving} onClick={onClose}
          className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer disabled:opacity-50">Keep it</button>
        <button type="button" disabled={saving || reason.trim().length < 3} onClick={() => void save()}
          className="btn-tactile min-h-[42px] px-5 bg-red-600 text-white text-xs font-black uppercase cursor-pointer disabled:opacity-50">
          {saving ? 'Voiding…' : 'Void payout'}
        </button>
      </>}>
      <div className="space-y-3 text-xs">
        <p className="font-sans">Use this only for a payout recorded by mistake. It stays on record as voided, and its {payout.lines.length} service
          {payout.lines.length === 1 ? '' : 's'} become unpaid again.</p>
        <label className="block">
          <span className="block text-[11px] font-black uppercase mb-1">Reason <span className="text-red-600">*</span></span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus placeholder="e.g. Recorded for the wrong week"
            className="w-full min-h-[40px] px-3 border border-neutral-400 bg-canvas" />
        </label>
      </div>
    </Modal>
  );
};
