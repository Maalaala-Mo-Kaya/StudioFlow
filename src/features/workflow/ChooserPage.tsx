import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff, Maximize2, X } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { stationButton, stationCard, stationGrid, StationLayout, StationStudentDetails, type StationStudent } from './StationLayout';

const availability = {
  available: 'Photos available',
  pending_shoot: 'Photography pending',
  empty: 'Waiting for supported photos',
  missing: 'Waiting for photo folder',
  unavailable: 'Photo folder unavailable',
  recovering: 'Photo transfer needs recovery',
};
const selectionStates = {
  awaiting: 'Awaiting selection',
  in_progress: 'Selection in progress',
  completed: 'Selection completed',
  needs_review: 'Selection needs review',
  recovering: 'Transfer paused',
};
interface ChooserStudent extends StationStudent {
  availability: keyof typeof availability;
  selectionState: keyof typeof selectionStates;
  selectedCount: number;
  unselectedCount: number;
}
interface Photo {
  id: string;
  name: string;
  group: string;
  selected: boolean;
}
interface Gallery {
  student: StationStudent;
  photos: Photo[];
  version: string;
  limit: number;
}

export function ChooserPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [opening, setOpening] = useState(false);
  const [gallery, setGallery] = useState<Gallery>();
  const { data, error, refresh } = useWorkflowData<{ items: ChooserStudent[]; hasMore: boolean }>(
    `/chooser?q=${encodeURIComponent(search.trim())}&page=${page}&selection=${filter}`,
  );

  async function open(student: ChooserStudent) {
    setOpening(true);
    try {
      setGallery(await pb.send<Gallery>(`${workflowApi}/chooser/${student.id}/open`, { method: 'POST' }));
    } catch (error) {
      toast.error(workflowError(error));
      refresh();
    } finally {
      setOpening(false);
    }
  }

  return (
    <StationLayout title="Photo Chooser" refresh={refresh} embedded={embedded}>
      {gallery ? <PhotoGallery key={gallery.student.id} initial={gallery} close={() => { setGallery(undefined); refresh(); }} /> : <>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-56 max-w-xl">
            <span className="block mb-1 text-xs font-black uppercase">Find a student</span>
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Name, student ID, job order, school or course"
              className="w-full min-h-11 border-2 border-black bg-white px-3 py-2 text-sm" />
          </label>
          {embedded && (
            <label className="block">
              <span className="block mb-1 text-xs font-black uppercase">Selection status</span>
              <select className="min-h-11 border-2 border-black bg-white px-3 text-sm" value={filter}
                onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
                <option value="">All selections</option>
                {Object.entries(selectionStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}
        </div>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {!data && !error && <p role="status">Looking up students…</p>}
        {data?.items.length === 0 && <p className="text-sm text-neutral-600">{search ? 'No students match this search.' : 'No completed sessions match this view.'}</p>}
        <div className={stationGrid}>
          {data?.items.map((student) => (
            <article key={student.id} className={`${stationCard} space-y-3`}>
              <StationStudentDetails student={student} />
              <div className="border-t border-neutral-300 pt-2 text-sm">
                <p>{student.photographyComplete ? 'Photography completed' : 'Photography pending'}</p>
                <p className="font-bold">{selectionStates[student.selectionState]}</p>
                {(student.availability === 'available' || student.availability === 'empty') && <p>{student.selectedCount} selected · {student.unselectedCount} unselected</p>}
                {student.availability !== 'available' && student.availability !== 'pending_shoot' && <p>{availability[student.availability]}</p>}
              </div>
              <button className={stationButton} type="button" disabled={opening || !['available', 'recovering'].includes(student.availability)}
                onClick={() => void open(student)}>
                {student.availability === 'recovering' ? 'Resume transfer' : 'View photos'}
              </button>
            </article>
          ))}
        </div>
        {(page > 1 || data?.hasMore) && (
          <nav aria-label="Student results" className="flex items-center gap-3">
            <button className={stationButton} type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="font-mono text-xs">Page {page}</span>
            <button className={stationButton} type="button" disabled={!data?.hasMore} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </>}
    </StationLayout>
  );
}

function PhotoGallery({ initial, close }: { initial: Gallery; close: () => void }) {
  const [gallery, setGallery] = useState(initial);
  const [selected, setSelected] = useState(() => new Set(initial.photos.filter((item) => item.selected).map((item) => item.id)));
  const [preview, setPreview] = useState<{ url: string; name: string }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const request = useRef<string | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const path = `/chooser/${gallery.student.id}`;
  const live = useWorkflowData<Gallery>(path);
  const stale = conflict || (!!live.data && live.data.version !== gallery.version);
  const limit = live.data?.limit ?? gallery.limit;
  const overLimit = !!limit && selected.size > limit;

  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
  }, [preview]);

  function setCurrent(next: Gallery) {
    setGallery(next);
    setSelected(new Set(next.photos.filter((item) => item.selected).map((item) => item.id)));
    setConflict(false);
    request.current = undefined;
    live.refresh();
  }

  async function update(confirm: boolean) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const endpoint = workflowApi + path + (confirm ? '/confirm' : '/open');
      request.current ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const next = await pb.send<Gallery>(endpoint, {
        method: 'POST',
        body: confirm ? { selected: [...selected], version: gallery.version, requestId: request.current } : undefined,
      });
      setCurrent(next);
      if (confirm) setStatus('Photo selection saved.');
    } catch (failure) {
      setError(workflowError(failure));
      if (failure instanceof ClientResponseError && failure.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setStatus('');
    request.current = undefined;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (!limit || next.size < limit) next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className={`${stationCard} flex flex-wrap items-start justify-between gap-3`}>
        <StationStudentDetails student={gallery.student} />
        <button type="button" className={stationButton} disabled={busy} onClick={close}>Back to students</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="font-bold">{selected.size} selected{limit ? ` · Limit ${limit}` : ''}</p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={stationButton} disabled={busy} onClick={() => void update(false)}>Reload gallery</button>
          <button type="button" className={stationButton} disabled={busy || stale || !selected.size || overLimit}
            onClick={() => void update(true)}>{busy ? 'Working…' : 'Confirm selection'}</button>
        </div>
      </div>
      {stale && <p role="alert" className="font-bold text-red-700">The gallery changed. Reload it to see the latest photos and saved selection.</p>}
      {(error || live.error) && <p role="alert" className="font-bold text-red-700">{error || live.error}</p>}
      {status && <p role="status" className="font-bold text-emerald-800">{status}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {gallery.photos.map((photo) => (
          <PhotoTile key={gallery.version + photo.id} photo={photo} path={path} checked={selected.has(photo.id)}
            onToggle={() => toggle(photo.id)} disabled={busy || stale} onPreview={(url) => setPreview({ url, name: photo.name })} />
        ))}
      </div>
      <dialog ref={dialog} onClose={() => setPreview(undefined)} className="fixed inset-0 m-auto max-h-screen max-w-screen bg-black text-white p-3 backdrop:bg-black/90">
        {preview && (
          <div className="flex flex-col items-center gap-2">
            <button type="button" className={`${stationButton} self-end`} onClick={() => dialog.current?.close()}><X size={16} /> Close preview</button>
            <img className="max-h-[85dvh] max-w-[92vw] object-contain" src={preview.url} alt={preview.name} />
          </div>
        )}
      </dialog>
    </div>
  );
}

function PhotoTile({ photo, path, checked, disabled, onToggle, onPreview }: {
  photo: Photo; path: string; checked: boolean; disabled: boolean; onToggle: () => void; onPreview: (url: string) => void;
}) {
  const tile = useRef<HTMLElement>(null);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const query = new URLSearchParams({ group: photo.group, name: photo.name });
      void fetch(pb.buildURL(`${workflowApi}${path}/image/${photo.id}?${query}`), {
        headers: { Authorization: pb.authStore.token },
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error('Photo unavailable.');
        return response.blob();
      }).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, { rootMargin: '250px' });
    if (tile.current) observer.observe(tile.current);
    return () => {
      observer.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, photo.id, photo.group, photo.name]);

  return (
    <article ref={tile} className={`relative border-2 bg-white min-w-0 ${checked ? 'border-[#C9A227] ring-2 ring-[#C9A227]' : 'border-black'}`}>
      <button type="button" aria-label={`Select ${photo.name}`} aria-pressed={checked}
        disabled={disabled || (!url && !checked) || (failed && !checked)} onClick={onToggle} className="relative block w-full">
        {url && !failed ? <img className="aspect-square w-full object-cover bg-neutral-100" src={url} alt="" onError={() => setFailed(true)} /> :
          <span className="aspect-square flex flex-col justify-center items-center gap-1 bg-neutral-100 px-1 text-xs text-neutral-600">
            {failed && <ImageOff size={20} />}{failed ? 'Image unavailable' : 'Loading photo…'}
          </span>}
        {checked && <span className="absolute top-1 left-1 bg-[#C9A227] text-black border border-black p-1"><Check size={16} /></span>}
      </button>
      <div className="flex items-center justify-between gap-1 p-1.5">
        <span className="truncate text-xs font-mono" title={photo.name}>{photo.name}</span>
        <button type="button" title="Full-screen preview" aria-label={`Preview ${photo.name}`} disabled={!url || failed}
          onClick={() => onPreview(url)} className="shrink-0 p-2 disabled:opacity-30"><Maximize2 size={15} /></button>
      </div>
    </article>
  );
}
