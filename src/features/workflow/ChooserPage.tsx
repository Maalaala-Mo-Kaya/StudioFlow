import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff, Maximize2, X } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { studioDate } from '../../utils/studioDay';
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

type Done = 'not_selected' | 'selected' | '';
interface FilterSchool {
  id: string;
  name: string;
  walkin: boolean;
  clients: number;
  courses: { id: string; name: string; clients: number }[];
}
interface ChooserList {
  items: ChooserStudent[];
  hasMore: boolean;
  counts?: { all: number; selected: number; notSelected: number };
}

export function ChooserPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  // Opens on the clients still to choose: the ones the chooser works through.
  const [done, setDone] = useState<Done>('not_selected');
  const [school, setSchool] = useState('');
  const [course, setCourse] = useState('');
  // Date created (studio day, Manila): all, today, yesterday or a picked date.
  const [dayMode, setDayMode] = useState<'' | 'today' | 'yesterday' | 'pick'>('');
  const [pickedDay, setPickedDay] = useState(() => studioDate());
  const day = dayMode === 'today' ? studioDate() : dayMode === 'yesterday' ? studioDate(1) : dayMode === 'pick' ? pickedDay : '';
  const [opening, setOpening] = useState(false);
  const [gallery, setGallery] = useState<Gallery>();
  const query = new URLSearchParams({ q: search.trim(), page: String(page), selection: filter, done, school, course, day });
  const { data, error, refresh } = useWorkflowData<ChooserList>(`/chooser?${query}`);
  const filters = useWorkflowData<{ schools: FilterSchool[] }>('/chooser-filters');
  const schools = filters.data?.schools ?? [];
  const chosenSchool = schools.find((item) => item.id === school);
  const filtered = !!(search.trim() || done !== 'not_selected' || school || course || filter || dayMode);
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const clearFilters = () => {
    setSearch(''); setDone('not_selected'); setSchool(''); setCourse(''); setFilter(''); setDayMode(''); setPage(1);
  };

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
        <div className={`${stationCard} space-y-3`}>
          {/* Selection: the main filter, with counts for the current search / school / course */}
          <div role="group" aria-label="Photo selection" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              ['not_selected', 'Not yet selected', data?.counts?.notSelected],
              ['selected', 'Already selected', data?.counts?.selected],
              ['', 'All clients', data?.counts?.all],
            ] as const).map(([value, label, count]) => (
              <button key={value || 'all'} type="button" aria-pressed={done === value} onClick={() => change(setDone)(value)}
                className={`btn-tactile min-h-12 px-3 border-2 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                  done === value ? 'bg-gold text-on-gold border-gold' : 'bg-panel text-ink border-line hover:border-gold'
                }`}>
                {label}
                {count !== undefined && <span className={`font-mono text-[11px] px-1.5 py-0.5 ${done === value ? 'bg-obsidian text-gold' : 'bg-gold-wash text-gold-soft'}`}>{count}</span>}
              </button>
            ))}
          </div>

          {/* Search + school / course (advanced filter) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <label className="block sm:col-span-2 lg:col-span-4">
              <span className="block mb-1 text-xs font-black uppercase">Search all clients</span>
              <input type="search" value={search} onChange={(event) => change(setSearch)(event.target.value)}
                placeholder="Name, student ID, job order, school, course, company or session"
                className="w-full min-h-11 border-2 border-line bg-panel px-3 py-2 text-sm" />
            </label>
            <label className="block lg:col-span-3">
              <span className="block mb-1 text-xs font-black uppercase">School / client type</span>
              <select className="w-full min-h-11 border-2 border-line bg-panel px-3 text-sm" value={school}
                onChange={(event) => { setSchool(event.target.value); setCourse(''); setPage(1); }}>
                <option value="">All schools &amp; clients</option>
                {schools.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
              </select>
            </label>
            <label className="block lg:col-span-2">
              <span className="block mb-1 text-xs font-black uppercase">{chosenSchool?.walkin ? 'Session' : 'Course'}</span>
              <select className="w-full min-h-11 border-2 border-line bg-panel px-3 text-sm disabled:opacity-50" value={course}
                disabled={!chosenSchool} onChange={(event) => change(setCourse)(event.target.value)}>
                <option value="">{chosenSchool ? `All ${chosenSchool.walkin ? 'sessions' : 'courses'}` : 'Choose a school first'}</option>
                {chosenSchool?.courses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
              </select>
            </label>
            <div className="block sm:col-span-2 lg:col-span-3">
              <label htmlFor="chooser-day" className="block mb-1 text-xs font-black uppercase">Job order created</label>
              <div className="flex gap-2">
                <select id="chooser-day" className="flex-1 min-w-0 min-h-11 border-2 border-line bg-panel px-3 text-sm" value={dayMode}
                  onChange={(event) => change(setDayMode)(event.target.value as typeof dayMode)}>
                  <option value="">All dates</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="pick">Pick a date…</option>
                </select>
                {dayMode === 'pick' && (
                  <input type="date" aria-label="Date created" value={pickedDay} max={studioDate()}
                    onChange={(event) => { if (event.target.value) change(setPickedDay)(event.target.value); }}
                    className="min-h-11 border-2 border-line bg-panel px-2 text-sm" />
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-neutral-600">
              Showing photographed clients only{search.trim() ? ' that match the search' : ''}.
              {day && ` Created ${dayMode === 'today' ? 'today' : dayMode === 'yesterday' ? 'yesterday' : 'on ' + day}.`}
            </p>
            <button type="button" className={stationButton} disabled={!filtered} onClick={clearFilters}>Clear filters</button>
          </div>

          {embedded && (
            <label className="block max-w-xs">
              <span className="block mb-1 text-xs font-black uppercase">Exact selection status</span>
              <select className="w-full min-h-11 border-2 border-line bg-panel px-3 text-sm" value={filter}
                onChange={(event) => change(setFilter)(event.target.value)}>
                <option value="">Any status</option>
                {Object.entries(selectionStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}
        </div>
        {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
        {!data && !error && <p role="status">Looking up students…</p>}
        {data?.items.length === 0 && (
          <p className="text-sm text-neutral-600">
            {search.trim() ? 'No photographed clients match this search and these filters. Clients appear here once the photographer marks their shoot done.'
              : done === 'not_selected' ? 'Everyone photographed in this view has already chosen their photos.'
              : done === 'selected' ? 'No one in this view has chosen their photos yet.'
              : 'No completed sessions match this view.'}
          </p>
        )}
        <div className={stationGrid}>
          {data?.items.map((student) => (
            <article key={student.id} className={`${stationCard} space-y-3`}>
              <div className="flex items-start justify-between gap-2">
                <StationStudentDetails student={student} />
                {['completed', 'needs_review'].includes(student.selectionState) ? (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase border border-emerald-500 text-emerald-700 bg-emerald-50">
                    <Check size={12} /> Selected
                  </span>
                ) : student.photographyComplete && (
                  <span className="shrink-0 px-2 py-1 text-[10px] font-black uppercase border border-gold text-gold-soft bg-gold-wash">Not yet</span>
                )}
              </div>
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
      <dialog ref={dialog} onClose={() => setPreview(undefined)} className="fixed inset-0 m-auto max-h-screen max-w-screen theme-night bg-black text-white p-3 backdrop:bg-black/90">
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
    <article ref={tile} className={`relative border-2 bg-panel min-w-0 ${checked ? 'border-gold ring-2 ring-gold' : 'border-line'}`}>
      <button type="button" aria-label={`Select ${photo.name}`} aria-pressed={checked}
        disabled={disabled || (!url && !checked) || (failed && !checked)} onClick={onToggle} className="relative block w-full">
        {url && !failed ? <img className="aspect-square w-full object-cover bg-neutral-100" src={url} alt="" onError={() => setFailed(true)} /> :
          <span className="aspect-square flex flex-col justify-center items-center gap-1 bg-neutral-100 px-1 text-xs text-neutral-600">
            {failed && <ImageOff size={20} />}{failed ? 'Image unavailable' : 'Loading photo…'}
          </span>}
        {checked && <span className="absolute top-1 left-1 bg-gold text-black border border-line p-1"><Check size={16} /></span>}
      </button>
      <div className="flex items-center justify-between gap-1 p-1.5">
        <span className="truncate text-xs font-mono" title={photo.name}>{photo.name}</span>
        <button type="button" title="Full-screen preview" aria-label={`Preview ${photo.name}`} disabled={!url || failed}
          onClick={() => onPreview(url)} className="shrink-0 p-2 disabled:opacity-30"><Maximize2 size={15} /></button>
      </div>
    </article>
  );
}
