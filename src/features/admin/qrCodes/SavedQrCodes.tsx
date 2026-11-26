import { DataFeedback } from '../../../components/common/DataFeedback';
import { useEffect, useState } from 'react';
import { Archive, Eye, Pencil, QrCode, Trash2, Wifi } from 'lucide-react';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { TablePagination } from '../../../components/common/TablePagination';
import { makeQrImage, type QrImage } from '../../../utils/qrImage';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { ManagedQrAddress, QrGraphic, QrPreview } from './QrPreview';
import {
  deleteQr, destinationHost, listQrs, loadWifiPassword, managedQrUrl, qrError, qrKindLabels, qrTitle,
  setQrDisabled, wifiPayload, wifiSecurityLabels, type SavedQr,
} from './qrCodes';

const secondary = `${stationButton} bg-canvas! text-ink! hover:text-gold!`;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'Asia/Manila' });
const statusLabels = { active: 'Active', disabled: 'Disabled', expired: 'Expired', metadata: 'Password needed', ready: 'Ready' };
const perPage = 9;

function useManagedImage(slug: string) {
  const [image, setImage] = useState<QrImage | null>(null);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    if (!slug) return;
    let active = true;
    void makeQrImage(managedQrUrl(slug)).then((result) => {
      if (active) setImage(result);
    }).catch(() => {
      if (active) setImageError(true);
    });
    return () => { active = false; };
  }, [slug]);
  return { image, imageError };
}

function Thumbnail({ slug }: { slug: string }) {
  const { image } = useManagedImage(slug);
  return image ? <QrGraphic image={image} className="block w-full" />
    : <QrCode aria-hidden="true" className="size-6 text-gold" />;
}

function SavedPreview({ record, onClose, onEdit }: { record: SavedQr; onClose: () => void; onEdit: () => void }) {
  const { image, imageError } = useManagedImage(record.slug);
  const [wifiImage, setWifiImage] = useState<QrImage | null>(null);
  const [wifiError, setWifiError] = useState('');
  const title = qrTitle(record.kind, record.name);
  const close = <button type="button" className={secondary} onClick={onClose}>Close Preview</button>;
  useEffect(() => {
    if (record.kind !== 'wifi' || record.status !== 'ready' || !record.security) return;
    let active = true;
    const settings = {
      kind: 'wifi', name: record.name, ssid: record.ssid, security: record.security, hiddenNetwork: record.hiddenNetwork,
    } as const;
    const credentials = record.hasWifiPassword ? loadWifiPassword(record.id) : Promise.resolve('');
    void credentials.then((password) => makeQrImage(wifiPayload(settings, password))).then((result) => {
      if (active) setWifiImage(result);
    }).catch((problem) => {
      if (active) setWifiError(qrError(problem, 'The Wi-Fi QR preview could not be loaded.'));
    });
    return () => { active = false; };
  }, [record]);

  if (record.kind === 'wifi') {
    if (wifiImage && record.security) {
      return (
        <QrPreview preview={{
          kind: 'wifi', image: wifiImage, title, detail: `Network: ${record.ssid}`,
          security: wifiSecurityLabels[record.security] + (record.hiddenNetwork ? ' · Hidden network' : ''),
        }}>{close}</QrPreview>
      );
    }
    return (
      <section className={`${stationCard} space-y-3`}>
        <h3 className="font-black text-ink">{title}</h3>
        <p className="break-words text-sm text-ink">Network: {record.ssid}</p>
        {wifiError ? <p role="alert" className="text-sm text-red-600">{wifiError}</p>
          : record.status === 'ready' ? <p role="status" className="text-sm">Loading QR preview…</p>
            : <p className="text-sm text-neutral-700">Enter the Wi-Fi password to regenerate this older code.</p>}
        <div className="flex flex-wrap gap-2">
          {(record.status !== 'ready' || wifiError) && <button type="button" className={stationButton} onClick={onEdit}>Regenerate Wi-Fi QR</button>}
          {close}
        </div>
      </section>
    );
  }
  if (!image) {
    return (
      <div className={`${stationCard} flex flex-wrap items-center gap-3`}>
        <p role={imageError ? 'alert' : 'status'}>{imageError ? 'The preview could not be loaded.' : 'Loading QR preview…'}</p>
        {close}
      </div>
    );
  }
  return (
    <QrPreview preview={{
      image, kind: record.kind, title,
      detail: record.kind === 'protected' ? 'Password required' : destinationHost(record.destination),
    }}>
      <div className="space-y-2">
        <ManagedQrAddress slug={record.slug} />
        {record.status !== 'active' && <p className="text-sm text-gold">This link is {record.status}.</p>}
        {close}
      </div>
    </QrPreview>
  );
}

export function SavedQrCodes({ onEdit }: { onEdit: (record: SavedQr) => void }) {
  const [records, setRecords] = useState<SavedQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadRequest, setLoadRequest] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [pending, setPending] = useState('');
  const [deleting, setDeleting] = useState<SavedQr | null>(null);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(records.length / perPage));
  const currentPage = Math.min(page, pageCount);
  const visible = records.slice((currentPage - 1) * perPage, currentPage * perPage);

  useEffect(() => {
    let active = true;
    void listQrs().then((result) => {
      if (active) { setRecords(result); setReady(true); }
    }).catch((problem) => {
      if (active) {
        console.error('Failed to load saved QR codes:', problem);
        setLoadError('Could not load saved QR codes.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadRequest]);

  function refresh() {
    setLoadError('');
    setLoading(true);
    setLoadRequest((current) => current + 1);
  }

  async function toggle(record: SavedQr) {
    setPending(record.id);
    setError('');
    try {
      const updated = await setQrDisabled(record.id, !record.disabled);
      setRecords((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (problem) {
      setError(qrError(problem, 'The QR code status could not be changed.'));
    } finally {
      setPending('');
    }
  }

  async function remove(record: SavedQr) {
    setPending(record.id);
    setError('');
    try {
      await deleteQr(record.id);
      setRecords((current) => current.filter(({ id }) => id !== record.id));
    } catch (problem) {
      setError(qrError(problem, 'The QR code could not be deleted.'));
    } finally {
      setPending('');
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="saved-qr-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="saved-qr-heading" className="font-black uppercase tracking-wide text-ink">Saved QR Codes</h2>
        <button type="button" className={secondary} disabled={loading || !!pending} onClick={refresh}>Refresh</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <DataFeedback loading={loading && !ready} refreshing={loading && ready} error={loadError} onRetry={refresh}
        loadingMessage="Loading saved QR codes…" emptyMessage={ready && !records.length ? 'No saved QR codes yet.' : undefined}
        className={stationCard} />
      {visible.map((record) => {
        const isWifi = record.kind === 'wifi';
        const title = qrTitle(record.kind, record.name);
        const created = dateFormat.format(new Date(record.created.replace(' ', 'T')));
        return (
          <article key={record.id} className={`${stationCard} space-y-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-16 shrink-0 place-items-center border border-line bg-obsidian">
                  {isWifi ? <Wifi aria-hidden="true" className="size-6 text-gold" /> : <Thumbnail slug={record.slug} />}
                </div>
                <div className="min-w-0">
                  <h3 className="break-words font-black text-ink">{title}</h3>
                  <p className="text-xs text-neutral-700">{qrKindLabels[record.kind]} · {created}</p>
                  <p className="break-words text-sm text-neutral-700">
                    {isWifi ? [record.ssid, record.security && wifiSecurityLabels[record.security], record.hiddenNetwork && 'Hidden network'].filter(Boolean).join(' · ')
                      : record.kind === 'protected' ? (record.expiresOn ? `Expires ${record.expiresOn}` : 'Password required')
                        : destinationHost(record.destination)}
                  </p>
                </div>
              </div>
              <span className="border border-line bg-gold-wash px-2 py-1 font-mono text-xs font-bold text-ink">{statusLabels[record.status]}</span>
            </div>
            <div className="flex flex-wrap gap-2" aria-label={`Actions for ${title}`}>
              <button type="button" className={secondary} aria-expanded={selected === record.id}
                onClick={() => setSelected(selected === record.id ? '' : record.id)}><Eye size={15} /> View</button>
              <button type="button" className={secondary} disabled={!!pending} onClick={() => onEdit(record)}><Pencil size={15} /> Edit</button>
              {!isWifi && (
                <button type="button" className={secondary} disabled={!!pending} onClick={() => void toggle(record)}>
                  <Archive size={15} /> {record.disabled ? 'Enable' : 'Disable'}
                </button>
              )}
              <button type="button" className={secondary} disabled={!!pending} onClick={() => setDeleting(record)}><Trash2 size={15} /> Delete</button>
            </div>
            {selected === record.id && <SavedPreview record={record} onClose={() => setSelected('')} onEdit={() => onEdit(record)} />}
          </article>
        );
      })}
      {pageCount > 1 && <TablePagination label="Saved QR pages" pageLabel={`${currentPage} / ${pageCount}`}
        previous={currentPage > 1 ? () => { setPage(currentPage - 1); setSelected(''); } : undefined}
        next={currentPage < pageCount ? () => { setPage(currentPage + 1); setSelected(''); } : undefined} />}
      <ConfirmModal isOpen={!!deleting} title="Delete QR Code" confirmText="Delete" isDestructive
        message={deleting?.kind === 'wifi' ? 'Delete these saved network details? Existing Wi-Fi QR images will still contain the encoded credentials.'
          : 'Delete this QR code? Its printed StudioFlow link will stop working permanently.'}
        onClose={() => setDeleting(null)} onConfirm={async () => { if (deleting) await remove(deleting); }} />
    </section>
  );
}
