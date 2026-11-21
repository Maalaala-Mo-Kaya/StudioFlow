import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff, Maximize2, X } from 'lucide-react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { studioDate } from '../../utils/studioDay';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { defaultTableExpansion, type TableExpansion } from '../../components/common/dataTableModel';
import { StationTabs } from './StationTabs';
import { stationButton, stationCard, stationInput, StationLayout, StationStudentDetails, type StationStudent } from './StationLayout';

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
  const [pages, setPages] = useState<Partial<Record<Done, number>>>({});
  const [filter, setFilter] = useState('');
  // Opens on the clients still to choose: the ones the chooser works through.
  const [done, setDone] = useState<Done>('not_selected');
  const [expansions, setExpansions] = useState<Partial<Record<Done, TableExpansion>>>({});
  const page = pages[done] ?? 1;
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
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPages({}); };
  const clearFilters = () => {
    setSearch(''); setDone('not_selected'); setSchool(''); setCourse(''); setFilter(''); setDayMode(''); setPages({});
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

  function selectionAction(student: ChooserStudent) {
    return (
      <button className={stationButton} type="button" disabled={opening || !['available', 'recovering'].includes(student.availability)}
        onClick={() => void open(student)}>
        {student.availability === 'recovering' ? 'Resume transfer' : 'Open photo selection'}
      </button>
    );
  }

  const columns: DataTableColumn<ChooserStudent>[] = [
    { id: 'job', header: 'Job Order №', accessor: (student) => student.jobOrder, cellClassName: 'whitespace-nowrap font-mono font-bold' },
    { id: 'name', header: 'Client name', accessor: (student) => student.name, cellClassName: 'font-bold', minWidth: 120 },
    { id: 'school', header: 'School / Client type', cell: (student) => <>
      {student.school || '—'}{student.course && <span className="block text-neutral-600">{student.course}</span>}
    </> },
    { id: 'package', header: 'Package', accessor: (student) => student.packageName },
    { id: 'status', header: 'Photo selection status', cell: (student) => (
      <span className={`inline-block border px-1.5 py-0.5 font-bold ${student.selectionState === 'completed' ? 'border-emerald-600/40 text-emerald-700' : 'border-line text-ink'}`}>
        {selectionStates[student.selectionState]}
      </span>
    ) },
    { id: 'actions', header: 'Actions', cell: selectionAction, minWidth: 145 },
  ];

  return (
    <StationLayout title="Photo Chooser" badge="Photo Selection" liveLabel="Live Status"
      description="Manage client photo selections and completed selections." refresh={refresh} embedded={embedded}>
      {gallery ? <PhotoGallery key={gallery.student.id} initial={gallery} close={() => { setGallery(undefined); refresh(); }} /> : (
        <StationTabs label="Photo selection views" active={done} onChange={setDone} tabs={[
          { id: 'not_selected', label: 'Not Yet Selected', count: data?.counts?.notSelected },
          { id: 'selected', label: 'Already Selected', count: data?.counts?.selected },
          { id: '', label: 'All Clients', count: data?.counts?.all },
        ]}>
          {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
          <DataTable label="Photo Chooser clients" rows={data?.items ?? []} columns={columns}
            getRowId={(student) => student.id} pagination={false} loading={!data && !error} loadingMessage="Looking up clients…"
            filtered={!!(search.trim() || school || course || filter || dayMode)}
            filteredEmptyMessage="No photographed clients match the current filters."
            emptyMessage={done === 'not_selected' ? 'No photographed clients are waiting for photo selection.'
              : done === 'selected' ? 'No completed photo selections.' : 'No photographed clients found.'}
            headerClassName="uppercase tracking-wide" tableClassName="min-w-[720px] [&_tr:has(button[aria-expanded=true])]:bg-gold-wash"
            expansion={{ value: expansions[done] ?? defaultTableExpansion,
              onChange: (next) => setExpansions((current) => ({ ...current, [done]: next })) }}
            renderExpanded={(student) => (
              <div className="space-y-3 text-sm">
                <StationStudentDetails student={student} />
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div><dt className="font-bold">Photography</dt><dd>{student.photographyComplete ? 'Completed' : 'Pending'}</dd></div>
                  <div><dt className="font-bold">Photo selection</dt><dd>{selectionStates[student.selectionState]}</dd></div>
                  <div><dt className="font-bold">Client repository</dt><dd>{availability[student.availability]}</dd></div>
                  {(student.availability === 'available' || student.availability === 'empty') && (
                    <div><dt className="font-bold">Selection progress</dt><dd>{student.selectedCount} selected · {student.unselectedCount} unselected</dd></div>
                  )}
                </dl>
                {selectionAction(student)}
              </div>
            )}
            toolbar={
              <div className="space-y-2 border-b border-line p-2">
                {/* Search + school / course (advanced filter) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-end">
                  <label className="block sm:col-span-2 lg:col-span-4">
                    <span className="mb-1 block text-[11px] font-bold uppercase">Search all clients</span>
                    <input type="search" value={search} onChange={(event) => change(setSearch)(event.target.value)}
                      placeholder="Name, student ID, job order, school, course, company or session"
                      className={`${stationInput} w-full`} />
                  </label>
                  <label className="block lg:col-span-3">
                    <span className="mb-1 block text-[11px] font-bold uppercase">School / client type</span>
                    <select className={`${stationInput} w-full`} value={school}
                      onChange={(event) => { setSchool(event.target.value); setCourse(''); setPages({}); }}>
                      <option value="">All schools &amp; clients</option>
                      {schools.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
                    </select>
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold uppercase">{chosenSchool?.walkin ? 'Session' : 'Course'}</span>
                    <select aria-label={chosenSchool?.walkin ? 'Session' : 'Course'}
                      className={`${stationInput} w-full disabled:opacity-50`} value={course}
                      disabled={!chosenSchool} onChange={(event) => change(setCourse)(event.target.value)}>
                      <option value="">{chosenSchool ? `All ${chosenSchool.walkin ? 'sessions' : 'courses'}` : 'Choose a school first'}</option>
                      {chosenSchool?.courses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
                    </select>
                  </label>
                  <div className="block sm:col-span-2 lg:col-span-3">
                    <label htmlFor="chooser-day" className="mb-1 block text-[11px] font-bold uppercase">Job order created</label>
                    <div className="flex flex-wrap gap-2">
                      <select id="chooser-day" className={`${stationInput} flex-1`} value={dayMode}
                        onChange={(event) => change(setDayMode)(event.target.value as typeof dayMode)}>
                        <option value="">All dates</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="pick">Pick a date…</option>
                      </select>
                      {dayMode === 'pick' && (
                        <input type="date" aria-label="Date created" value={pickedDay} max={studioDate()}
                          onChange={(event) => { if (event.target.value) change(setPickedDay)(event.target.value); }}
                          className={stationInput} />
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
                    <span className="mb-1 block text-[11px] font-bold uppercase">Exact selection status</span>
                    <select className={`${stationInput} w-full`} value={filter}
                      onChange={(event) => change(setFilter)(event.target.value)}>
                      <option value="">Any status</option>
                      {Object.entries(selectionStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            }
          />
          {(page > 1 || data?.hasMore) && (
            <nav aria-label="Photo Chooser pagination" className="flex flex-wrap items-center justify-end gap-2 border border-line bg-panel p-2 font-mono text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPages({ ...pages, [done]: page - 1 })} className={stationButton}>Previous</button>
              <span aria-live="polite">Page {page}</span>
              <button type="button" disabled={!data?.hasMore} onClick={() => setPages({ ...pages, [done]: page + 1 })} className={stationButton}>Next</button>
            </nav>
          )}
        </StationTabs>
      )}
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
