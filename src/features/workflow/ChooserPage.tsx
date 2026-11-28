import { CopyPathButton } from '../../components/common/CopyPathButton';
import { DataFeedback } from '../../components/common/DataFeedback';
import { useRef, useState } from 'react';
import { Check, Columns2, ImageOff, Images, Maximize2, StickyNote, Tags } from 'lucide-react';
import { ChooserGroupViewer } from './ChooserGroupViewer';
import { untagged, type ShotType } from '../camera/shotTypes';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../hooks/useWorkflowData';
import { useAuthedImage } from '../../hooks/useAuthedImage';
import { studioDate } from '../../utils/studioDay';
import { clampDay, useStudioCalendar } from '../../hooks/useStudioCalendar';
import { DataTable, tableActions, tableFilterControl, type DataTableColumn } from '../../components/common/DataTable';
import { TablePagination } from '../../components/common/TablePagination';
import { Modal } from '../../components/common/Modal';
import { StationTabs } from './StationTabs';
import { stationButton, stationCard, StationLayout, StationStudentDetails, type StationStudent } from './StationLayout';

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
  /** The chooser's note for the editor (selected photos only). */
  note?: string;
  /** Shot type code from the file name ('' = none). */
  type?: string;
}
interface Gallery {
  student: StationStudent;
  photos: Photo[];
  version: string;
  /** 0 = no limit (none set, or the DEV CON override is on). */
  limit: number;
  packageLimit?: number;
  limitOverride?: boolean;
  /** The shot type list, and the codes of the types the client's package includes. */
  types?: ShotType[];
  packageTypes?: string[];
}

interface PhotoGroup { code: string; name: string; inPackage: boolean; photos: Photo[] }

/** Photos by shot type: the package's types first (in list order), then the others, then untyped. */
function groupPhotos(gallery: Gallery): PhotoGroup[] {
  const list = gallery.types ?? [];
  const inPackage = new Set(gallery.packageTypes ?? []);
  const order = (code: string) => {
    const at = list.findIndex((type) => type.code === code);
    return (inPackage.has(code) ? 0 : 1_000_000) + (at < 0 ? 500_000 : at);
  };
  const byCode = new Map<string, Photo[]>();
  for (const photo of gallery.photos) {
    const code = photo.type ?? '';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(photo);
  }
  return [...byCode].map(([code, photos]) => ({
    code, photos, inPackage: inPackage.has(code), name: code ? list.find((type) => type.code === code)?.name ?? code : 'Other photos',
  })).sort((a, b) => (a.code ? 0 : 1) - (b.code ? 0 : 1) || order(a.code) - order(b.code));
}

/**
 * The same rules as checkTypes in pb_hooks/studio_photo_selection.js: with a limit, one photo per
 * type; each package type that has photos needs its pick until the limit is used up.
 */
function missingTypes(groups: PhotoGroup[], selected: Set<string>, limit: number) {
  if (!groups.some((group) => group.code)) return [];
  if (limit && selected.size >= limit) return [];
  return groups.filter((group) => group.inPackage && !group.photos.some((photo) => selected.has(photo.id)));
}

const NOTE_MAX = 500;
const notesOf = (gallery: Gallery) =>
  Object.fromEntries(gallery.photos.filter((photo) => photo.note).map((photo) => [photo.id, photo.note as string]));

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
  // The client whose details are open in a popup (by id, so it shows the latest status).
  const [openId, setOpenId] = useState<string | null>(null);
  const page = pages[done] ?? 1;
  const [school, setSchool] = useState('');
  const [course, setCourse] = useState('');
  // Date created (studio day, Manila): all, today, yesterday or a picked date.
  const [dayMode, setDayMode] = useState<'' | 'today' | 'yesterday' | 'pick'>('');
  const [pickedDay, setPickedDay] = useState(() => studioDate());
  const calendar = useStudioCalendar();
  const { start: firstDay } = calendar;
  const day = dayMode === 'today' ? studioDate() : dayMode === 'yesterday' ? studioDate(1) : dayMode === 'pick' ? pickedDay : '';
  const [opening, setOpening] = useState(false);
  const [gallery, setGallery] = useState<Gallery>();
  const query = new URLSearchParams({ q: search.trim(), page: String(page), selection: filter, done, school, course, day });
  const { data, loading, refreshing, error, refresh } = useWorkflowData<ChooserList>(`/chooser?${query}`);
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

  function chooserActions(student: ChooserStudent) {
    return (
      <div className={tableActions + ' gap-2'}>
        <button className={stationButton + ' whitespace-nowrap'} type="button" disabled={opening || !['available', 'recovering'].includes(student.availability)}
          onClick={() => void open(student)}>
          {student.availability === 'recovering' ? 'Resume transfer' : 'Open photo selection'}
        </button>
        <CopyPathButton registrationId={student.id} className="min-h-10 px-3 text-[11px]" />
      </div>
    );
  }

  const columns: DataTableColumn<ChooserStudent>[] = [
    { id: 'job', width: 120, header: 'Job Order №', accessor: (student) => student.jobOrder, cellClassName: 'whitespace-nowrap font-mono font-bold' },
    { id: 'name', header: 'Client name', accessor: (student) => student.name, cellClassName: 'font-bold', minWidth: 120 },
    { id: 'school', minWidth: 150, header: 'School / Client type', cell: (student) => <>
      {student.school || '—'}{student.course && <span className="block text-neutral-600">{student.course}</span>}
    </> },
    { id: 'package', minWidth: 148, header: 'Package', accessor: (student) => student.packageName },
    { id: 'status', width: 166, header: 'Photo selection status', cell: (student) => (
      <span className={`inline-block border px-1.5 py-0.5 font-bold ${student.selectionState === 'completed' ? 'border-emerald-600/40 text-emerald-700' : 'border-line text-ink'}`}>
        {selectionStates[student.selectionState]}
      </span>
    ) },
    { id: 'actions', width: 324, header: 'Actions', cell: chooserActions },
  ];

  return (
    <StationLayout title="Photo Chooser" badge="Photo Selection" liveLabel="Live Status"
      description="Manage client photo selections and completed selections." refresh={refresh} embedded={embedded}>
      {gallery ? <PhotoGallery key={gallery.student.id} initial={gallery} close={() => { setGallery(undefined); setOpenId(null); refresh(); }} /> : (
        <StationTabs label="Photo selection views" active={done} onChange={setDone} tabs={[
          { id: 'not_selected', label: 'Not Yet Selected', count: data?.counts?.notSelected },
          { id: 'selected', label: 'Already Selected', count: data?.counts?.selected },
          { id: '', label: 'All Clients', count: data?.counts?.all },
        ]}>
          <DataTable label="Photo Chooser clients" rows={data?.items ?? []} columns={columns}
            getRowId={(student) => student.id} pagination={false} loading={loading} refreshing={refreshing} error={error} onRetry={refresh} loadingMessage="Looking up clients…"
            searching={Boolean(search.trim())}
            filtered={!!(school || course || filter || dayMode)}
            filteredEmptyMessage="No photographed clients match the current filters."
            emptyMessage={done === 'not_selected' ? 'No photographed clients are waiting for photo selection.'
              : done === 'selected' ? 'No completed photo selections.' : 'No photographed clients found.'}
            headerClassName="uppercase tracking-wide" tableClassName="min-w-[720px]" viewportClassName="min-h-44"
            onRowClick={(student) => setOpenId(student.id)}
            toolbar={
              <div className="space-y-2 p-2">
                {opening && <p role="status" className="text-sm text-neutral-600">Opening photo selection…</p>}
                {filters.error && <DataFeedback error="Could not load the school and course filters." onRetry={filters.refresh} />}
                {/* Search + school / course (advanced filter) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 items-end">
                  <label className="block sm:col-span-2 lg:col-span-4">
                    <span className="mb-1 block text-[11px] font-bold uppercase">Search all clients</span>
                    <input type="search" value={search} onChange={(event) => change(setSearch)(event.target.value)}
                      placeholder="Name, student ID, job order, school, course, company or session"
                      className={`${tableFilterControl} w-full`} />
                  </label>
                  <label className="block lg:col-span-3">
                    <span className="mb-1 block text-[11px] font-bold uppercase">School / client type</span>
                    <select className={`${tableFilterControl} w-full`} value={school} disabled={!filters.data}
                      onChange={(event) => { setSchool(event.target.value); setCourse(''); setPages({}); }}>
                      <option value="">{filters.loading ? 'Loading schools…' : 'All schools & clients'}</option>
                      {schools.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
                    </select>
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold uppercase">{chosenSchool?.walkin ? 'Session' : 'Course'}</span>
                    <select aria-label={chosenSchool?.walkin ? 'Session' : 'Course'}
                      className={`${tableFilterControl} w-full disabled:opacity-50`} value={course}
                      disabled={!chosenSchool} onChange={(event) => change(setCourse)(event.target.value)}>
                      <option value="">{chosenSchool ? `All ${chosenSchool.walkin ? 'sessions' : 'courses'}` : 'Choose a school first'}</option>
                      {chosenSchool?.courses.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.clients})</option>)}
                    </select>
                  </label>
                  <div className="block sm:col-span-2 lg:col-span-3">
                    <label htmlFor="chooser-day" className="mb-1 block text-[11px] font-bold uppercase">Job order created</label>
                    <div className="flex flex-wrap gap-2">
                      <select id="chooser-day" className={`${tableFilterControl} flex-1`} value={dayMode}
                        onChange={(event) => change(setDayMode)(event.target.value as typeof dayMode)}>
                        <option value="">All dates</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="pick">Pick a date…</option>
                      </select>
                      {dayMode === 'pick' && (
                        <input type="date" aria-label="Date created" value={pickedDay} min={firstDay || undefined} max={studioDate()}
                          onChange={(event) => { if (event.target.value) change(setPickedDay)(clampDay(event.target.value, firstDay, studioDate())); }}
                          className={tableFilterControl} />
                      )}
                    </div>
                  </div>
                </div>
                {dayMode === 'pick' && <DataFeedback {...calendar} loadingMessage="Loading available dates…" />}
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
                    <select className={`${tableFilterControl} w-full`} value={filter}
                      onChange={(event) => change(setFilter)(event.target.value)}>
                      <option value="">Any status</option>
                      {Object.entries(selectionStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            }
          />
            {(() => {
            const student = openId ? data?.items?.find((item) => item.id === openId) : undefined;
            return student && (
              <Modal title={student.name || 'Client'} subtitle={<>Photo selection · {selectionStates[student.selectionState]}</>}
                icon={Images} onClose={() => setOpenId(null)}>
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
                {chooserActions(student)}
              </div>
              </Modal>
            );
          })()}
          <TablePagination label="Photo Chooser pagination" pageLabel={`Page ${page}`}
            previous={page > 1 ? () => setPages((current) => ({ ...current, [done]: page - 1 })) : undefined}
            next={data?.hasMore ? () => setPages((current) => ({ ...current, [done]: page + 1 })) : undefined} />
        </StationTabs>
      )}
    </StationLayout>
  );
}

function PhotoGallery({ initial, close }: { initial: Gallery; close: () => void }) {
  const [gallery, setGallery] = useState(initial);
  const [selected, setSelected] = useState(() => new Set(initial.photos.filter((item) => item.selected).map((item) => item.id)));
  const [notes, setNotes] = useState<Record<string, string>>(() => notesOf(initial));
  // A group full screen: all side by side (index null) or one photo at a time.
  const [viewer, setViewer] = useState<{ code: string; index: number | null }>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const request = useRef<string | undefined>(undefined);
  const path = `/chooser/${gallery.student.id}`;
  const live = useWorkflowData<Gallery>(path);
  const stale = conflict || (!!live.data && live.data.version !== gallery.version);
  const limit = live.data?.limit ?? gallery.limit;
  const packageLimit = live.data?.packageLimit ?? gallery.packageLimit ?? 0;
  const override = live.data?.limitOverride ?? gallery.limitOverride ?? false;
  const overLimit = !!limit && selected.size > limit;
  const groups = groupPhotos(live.data && live.data.version === gallery.version ? { ...gallery, types: live.data.types, packageTypes: live.data.packageTypes } : gallery);
  const typed = groups.some((group) => group.code);
  const missing = missingTypes(groups, selected, limit);
  const savedNotes = notesOf(gallery);
  const noteCount = [...selected].filter((id) => notes[id]?.trim()).length;
  const notesChanged = [...selected].some((id) => (notes[id]?.trim() || '') !== (savedNotes[id] || ''));

  function setCurrent(next: Gallery) {
    setGallery(next);
    setSelected(new Set(next.photos.filter((item) => item.selected).map((item) => item.id)));
    setNotes(notesOf(next));
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
        body: confirm ? {
          selected: [...selected], version: gallery.version, requestId: request.current,
          notes: Object.fromEntries([...selected].filter((id) => notes[id]?.trim()).map((id) => [id, notes[id].trim()])),
        } : undefined,
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
      if (next.has(id)) { next.delete(id); return next; }
      // One photo per type: picking another of the same type swaps the pick.
      const code = gallery.photos.find((photo) => photo.id === id)?.type;
      const sameType = limit && code ? gallery.photos.find((photo) => photo.type === code && next.has(photo.id)) : undefined;
      if (sameType) next.delete(sameType.id);
      if (!limit || next.size < limit) next.add(id);
      return next;
    });
  }

  function editNote(id: string, text: string) {
    setStatus('');
    request.current = undefined;
    setNotes((current) => ({ ...current, [id]: text.slice(0, NOTE_MAX) }));
  }

  return (
    <div className="space-y-5">
      <div className={`${stationCard} flex flex-wrap items-start justify-between gap-3`}>
        <StationStudentDetails student={gallery.student} />
        <div className={tableActions + ' gap-2'}>
          <CopyPathButton registrationId={gallery.student.id} className="min-h-10 px-3 text-[11px]" />
          <button type="button" className={stationButton} disabled={busy} onClick={close}>Back to students</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p aria-live="polite" className="font-bold m-0">
            {selected.size} selected{limit ? ` · Limit ${limit}` : ''}{noteCount ? ` · ${noteCount} with notes` : ''}
          </p>
          {override && (
            <p className="m-0 mt-1 inline-block border border-amber-500 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
              Limit override ON{packageLimit ? ` · package allows ${packageLimit}` : ''}: select as many as the client wants
            </p>
          )}
          <p className="m-0 mt-1 text-[11px] text-neutral-600">Add a note under a selected photo to tell the editor what the client wants (e.g. remove pimple, brighten).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={stationButton} disabled={busy} onClick={() => void update(false)}>Reload gallery</button>
          <button type="button" className={stationButton} disabled={busy || stale || !selected.size || overLimit || missing.length > 0}
            onClick={() => void update(true)}>{busy ? 'Working…' : 'Confirm selection'}</button>
        </div>
      </div>
      {typed && (
        <p role="status" className={`m-0 font-bold ${missing.length ? 'text-amber-700' : 'text-emerald-800'}`}>
          {missing.length
            ? `Choose one photo of each type in the package. Still to choose: ${missing.map((group) => group.name).join(', ')}.`
            : limit ? 'One photo of each type: picking another photo of a type swaps it.' : 'Every type in the package has a pick.'}
        </p>
      )}
      {notesChanged && !busy && (
        <p role="status" className="font-bold text-amber-700">Notes changed. Press Confirm selection to save them.</p>
      )}
      {stale && <p role="alert" className="font-bold text-red-700">The gallery changed. Reload it to see the latest photos and saved selection.</p>}
      {error && <p role="alert" className="font-bold text-red-700">{error}</p>}
      <DataFeedback refreshing={live.loading || live.refreshing} error={live.error} onRetry={live.refresh} />
      {status && <p role="status" className="font-bold text-emerald-800">{status}</p>}
      {groups.map((group) => {
        const picked = group.photos.filter((photo) => selected.has(photo.id)).length;
        return (
          <section key={group.code || 'none'} aria-label={group.name} className="space-y-2">
            <h3 className="m-0 flex flex-wrap items-center gap-2 border-b border-line pb-1 text-xs font-black uppercase tracking-wider text-ink">
              {typed && <><Tags className="size-4 text-gold" aria-hidden="true" /> {group.name}</>}
              <span className="font-mono text-[10px] font-bold normal-case text-neutral-600">
                {group.photos.length} photo{group.photos.length === 1 ? '' : 's'}
                {group.code ? (group.inPackage ? ' · in the package' : ' · not in the package') : ''}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => setViewer({ code: group.code, index: null })}
                  title="All the photos of this group full screen, side by side"
                  className="inline-flex min-h-8 items-center gap-1 border border-gold px-2 text-[10px] text-gold cursor-pointer">
                  <Columns2 size={13} /> View all
                </button>
                {group.code && (
                  <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] ${picked
                    ? 'border-emerald-600/40 text-emerald-700' : group.inPackage ? 'border-amber-500 text-amber-700' : 'border-line text-neutral-600'}`}>
                    {picked ? <><Check size={12} /> Chosen</> : group.inPackage ? 'Choose 1' : 'Optional'}
                  </span>
                )}
              </span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {group.photos.map((photo, position) => (
                <PhotoTile key={gallery.version + photo.id} photo={photo} path={path} checked={selected.has(photo.id)}
                  onToggle={() => toggle(photo.id)} disabled={busy || stale} onPreview={() => setViewer({ code: group.code, index: position })}
                  note={notes[photo.id] ?? ''} onNote={(text) => editNote(photo.id, text)} />
              ))}
            </div>
          </section>
        );
      })}
      {(() => {
        const group = viewer && groups.find((entry) => entry.code === viewer.code);
        if (!viewer || !group?.photos.length) return null;
        const picked = group.photos.filter((photo) => selected.has(photo.id)).length;
        return (
          <ChooserGroupViewer key={viewer.code} title={typed ? group.name : 'All photos'} photos={group.photos} path={path}
            selected={selected} disabled={busy || stale} startIndex={viewer.index} onToggle={toggle} onClose={() => setViewer(undefined)}
            summary={`${picked ? `${picked} chosen here` : group.code && group.inPackage ? 'choose 1' : 'none chosen here'} · ${selected.size}${limit ? ` of ${limit}` : ''} selected in all`} />
        );
      })()}
    </div>
  );
}

function PhotoTile({ photo, path, checked, disabled, onToggle, onPreview, note, onNote }: {
  photo: Photo; path: string; checked: boolean; disabled: boolean; onToggle: () => void; onPreview: () => void;
  note: string; onNote: (text: string) => void;
}) {
  const tile = useRef<HTMLElement>(null);
  const image = useAuthedImage(
    `${workflowApi}${path}/image/${photo.id}?${new URLSearchParams({ group: photo.group, name: photo.name })}`, tile,
  );
  const url = image.src;
  const [broken, setFailed] = useState(false);
  const failed = image.failed || broken;

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
        <span className="truncate text-xs font-mono" title={photo.name}>{untagged(photo.name)}</span>
        <button type="button" title="Full screen, one by one" aria-label={`Preview ${photo.name}`} disabled={!url || failed}
          onClick={onPreview} className="shrink-0 p-2 disabled:opacity-30"><Maximize2 size={15} /></button>
      </div>
      {checked && (
        <label className="block px-1.5 pb-1.5">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-neutral-600">
            <StickyNote size={12} /> Note for editor
          </span>
          <textarea value={note} maxLength={NOTE_MAX} rows={2} disabled={disabled}
            onChange={(event) => onNote(event.target.value)} placeholder="e.g. remove blemish, brighten"
            aria-label={`Note for editor about ${photo.name}`}
            className="mt-0.5 w-full resize-y border border-neutral-400 bg-canvas px-1.5 py-1 text-xs" />
        </label>
      )}
    </article>
  );
}
