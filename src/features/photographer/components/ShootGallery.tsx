import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Eye, EyeOff, HardDriveUpload, ImageOff, Images, RotateCcw, Tags, Trash2, X } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import { useWorkflowData, workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import { useAuthedImage } from '../../../hooks/useAuthedImage';
import { useToast } from '../../../context/ToastContext';
import { menuTypes, typeLabel, untagged, type ShotType, type ShotTypeListing } from '../../camera/shotTypes';
import { ShotTypeBar } from './ShotTypeBar';

interface Shot {
  id: string; name: string; size: number; modified: number; type: string;
  /** Where it came from: a camera id, or "card" (`by` = who uploaded it); '' when not recorded. */
  camera?: string; by?: string; byName?: string;
}
interface ShootData {
  photos: Shot[]; deleted: Shot[]; canEdit: boolean; reason: string; moved?: string[]; renamed?: string;
  /** Codes of the shot types the client's package includes. */
  packageTypes?: string[];
}

/** Photos and the RAW formats StudioFlow keeps (they go to the client's RAW folder). */
const cardAccept = 'image/jpeg,image/png,.jpg,.jpeg,.png,.cr2,.cr3,.crw,.dng,.nef,.nrw,.arw,.raf,.orf,.rw2,.pef,.srw';
const photoFile = /\.(jpe?g|png|webp|gif|avif)$/i;
const autoViewKey = 'studioflow-auto-view';
const menuHiddenKey = 'studioflow-viewer-menu-hidden';

const imageUrl = (registrationId: string, shot: Shot, deleted: boolean) =>
  `${workflowApi}/shoot/${registrationId}/image/${shot.id}?${new URLSearchParams({ name: shot.name, ...(deleted ? { deleted: '1' } : {}) })}`;
/** The same shot before and after a type change (the change renames it, so its id changes). */
const shotKey = (shot: Shot) => `${untagged(shot.name).toLowerCase()}|${shot.size}|${shot.modified}`;

function readFlag(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch { return fallback; }
}
function writeFlag(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* per-device convenience only */ }
}

// The shots this device has reviewed, per client (shot keys). The 60 most recent clients are kept.
const reviewedIndexKey = 'studioflow-reviewed-index';
const reviewedKey = (registrationId: string) => `studioflow-reviewed-${registrationId}`;
function readReviewed(registrationId: string): Set<string> | null {
  try {
    const saved = localStorage.getItem(reviewedKey(registrationId));
    return saved ? new Set(JSON.parse(saved) as string[]) : null;
  } catch { return null; }
}
function writeReviewed(registrationId: string, keys: Set<string>) {
  try {
    localStorage.setItem(reviewedKey(registrationId), JSON.stringify([...keys]));
    const index = (JSON.parse(localStorage.getItem(reviewedIndexKey) || '[]') as string[]).filter((id) => id !== registrationId);
    index.unshift(registrationId);
    for (const old of index.splice(60)) localStorage.removeItem(reviewedKey(old));
    localStorage.setItem(reviewedIndexKey, JSON.stringify(index));
  } catch { /* this visit only */ }
}

/**
 * The shots the camera import has moved into the on-set client's folder. New shots are reviewed one
 * by one, oldest first, full screen: the photographer chooses what each one is from the menu on the
 * left (Delete, or one of their shot types) and the next one shows. Each photographer reviews only
 * their own shots: from this device's camera, or their own card uploads.
 * Deleted shots move into the client's _DELETED folder (never off the disk) and can be restored
 * until the Chooser starts. The Chooser only ever sees the shots that are left.
 */
export const ShootGallery: React.FC<{
  registrationId: string;
  listing: ShotTypeListing | undefined;
  /** The type the next shots get. */
  shotType: string;
  onShotType: (code: string) => void;
  onEditMenu: () => void;
  /** How many new shots this device hasn't reviewed yet. */
  onPendingChange?: (count: number) => void;
  /** This device's camera ('' when none) and the signed-in photographer: whose shots to review. */
  stationId: string;
  userId: string;
  isAdmin: boolean;
}> = ({ registrationId, listing, shotType, onShotType, onEditMenu, onPendingChange, stationId, userId, isAdmin }) => {
  const { toast } = useToast();
  const live = useWorkflowData<ShootData>(`/shoot/${registrationId}/photos`, 4_000, true);
  // A delete, restore or type answer is newer than the last poll, until the next poll arrives.
  const [override, setOverride] = useState<{ base?: ShootData; data: ShootData }>();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string>();
  const [showDeleted, setShowDeleted] = useState(false);
  const [autoView, setAutoView] = useState(() => readFlag(autoViewKey, true));
  const data = override && override.base === live.data ? override.data : live.data;
  const { refresh } = live;
  const base = live.data;
  const cardInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number }>();
  const menu = useMemo(() => menuTypes(listing), [listing]);

  // Review: each new shot is shown full screen, oldest first, until the photographer chooses what it
  // is (a shot type, or Delete); then the next one shows. Kept per client on this device, so shots
  // that arrive while the popup is closed are reviewed when it opens again.
  const [reviewed, setReviewed] = useState<Set<string> | null>(() => readReviewed(registrationId));
  const [reviewing, setReviewing] = useState(false);
  const photos = data?.photos;
  useEffect(() => {
    if (!photos || reviewed) return;
    // The first time this device opens the client, the shots already there (another camera's) count as reviewed.
    const all = new Set(photos.map(shotKey));
    writeReviewed(registrationId, all);
    setReviewed(all);
  }, [photos, reviewed, registrationId]);
  // Only this photographer's shots: another camera's shots of the same client are theirs to review.
  const pending = useMemo(() => {
    if (!photos || !reviewed) return [];
    const mine = (shot: Shot) => shot.camera === 'card' ? shot.by === userId : !!stationId && shot.camera === stationId;
    return [...photos].reverse().filter((shot) => mine(shot) && !reviewed.has(shotKey(shot)));
  }, [photos, reviewed, stationId, userId]);
  const latestPending = pending.length ? shotKey(pending[pending.length - 1]) : '';
  // Reported when the count changes (the page's callback may be a new function on every render).
  const reportPending = useRef(onPendingChange);
  useEffect(() => { reportPending.current = onPendingChange; });
  useEffect(() => { reportPending.current?.(pending.length); }, [pending.length]);
  // A new shot (re)opens the review, unless the photographer turned that off.
  useEffect(() => {
    if (!latestPending || !autoView) return;
    setReviewing(true);
    setViewing(undefined);
  }, [latestPending, autoView]);
  const markReviewed = useCallback((shot: Shot) => {
    setReviewed((current) => {
      const next = new Set(current ?? []);
      next.add(shotKey(shot));
      writeReviewed(registrationId, next);
      return next;
    });
  }, [registrationId]);

  // Photos shot untethered (to the memory card): add them straight to this client, one file at a
  // time, with the type chosen above. Files already in the client's folders are skipped by the server.
  const addFromCard = async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading({ done: 0, total: files.length });
    let savedPhotos = 0;
    let savedRaw = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const response = await fetch(pb.buildURL(`${workflowApi}/shoot-upload/${registrationId}?${new URLSearchParams({ name: file.name, type: shotType })}`), {
          method: 'POST', body: file,
          headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/octet-stream' },
        });
        const reply = await response.json().catch(() => ({})) as { status?: string; message?: string };
        if (!response.ok) {
          failed.push(`${file.name}: ${reply.message || `error ${response.status}`}`);
          // Not allowed for this client (closed, Chooser started...): the rest would fail the same way.
          if ([401, 403, 409].includes(response.status)) break;
        } else if (reply.status === 'saved') {
          if (photoFile.test(file.name)) savedPhotos++; else savedRaw++;
        } else {
          skipped++;
        }
      } catch {
        failed.push(`${file.name}: the server can't be reached`);
      }
      setUploading({ done: index + 1, total: files.length });
    }
    const shots = savedPhotos || savedRaw;
    if (shots) {
      try {
        await pb.send(`${workflowApi}/shoot-upload/${registrationId}/done`, { method: 'POST', body: { count: shots }, requestKey: null });
      } catch { /* the photos are saved; only the floor badge is missing */ }
    }
    setUploading(undefined);
    refresh();
    const added = [savedPhotos && `${savedPhotos} photo${savedPhotos === 1 ? '' : 's'}`, savedRaw && `${savedRaw} RAW`].filter(Boolean).join(' and ');
    if (added) toast.success(`Added ${added} from the card${skipped ? ` (${skipped} already here)` : ''}.`);
    else if (skipped && !failed.length) toast.success(`All ${skipped} files are already in this client's folder.`);
    if (failed.length) toast.error(`${failed.length} file${failed.length === 1 ? '' : 's'} not added. ${failed[0]}`);
  };

  const change = useCallback(async (action: 'delete' | 'restore', shots: Shot[]) => {
    if (busy || !shots.length) return;
    setBusy(true);
    try {
      const result = await pb.send<ShootData>(`${workflowApi}/shoot/${registrationId}/${action}`, {
        method: 'POST', body: { photos: shots.map(({ id, name }) => ({ id, name })) },
      });
      setOverride({ base, data: result });
      if (action === 'restore') toast.success(`Restored ${result.moved?.join(', ') || 'the photo'}.`);
    } catch (error) {
      toast.error(workflowError(error));
      refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, registrationId, toast, refresh, base]);

  // Sets what kind of picture one shot is. The type for the next shots stays as it is (a
  // photographer may alternate, toga and without toga): it changes only in "Next shots are".
  const retag = useCallback(async (shot: Shot, code: string) => {
    if (busy || shot.type === code) return;
    setBusy(true);
    try {
      const result = await pb.send<ShootData>(`${workflowApi}/shoot/${registrationId}/retag`, {
        method: 'POST', body: { photo: { id: shot.id, name: shot.name }, code },
      });
      setOverride({ base, data: result });
      const renamed = result.photos.find((photo) => photo.name === result.renamed);
      if (renamed) setViewing((open) => open === shot.id ? renamed.id : open);
    } catch (error) {
      toast.error(workflowError(error));
      refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, registrationId, toast, refresh, base]);

  if (!data) {
    return live.error
      ? <p role="alert" className="mt-4 text-xs font-bold text-red-700">{live.error}</p>
      : <p role="status" className="mt-4 text-xs text-neutral-600">Loading shots…</p>;
  }
  const { deleted, canEdit, reason } = data;
  const kept = data.photos;
  const index = kept.findIndex((shot) => shot.id === viewing);
  const counts: Record<string, number> = {};
  for (const shot of kept) if (shot.type) counts[shot.type] = (counts[shot.type] ?? 0) + 1;
  const packageTypes = data.packageTypes ?? [];
  const missing = packageTypes.filter((code) => !counts[code]);
  const reviewShot = reviewing ? pending[0] : undefined;
  // Only the photographer who took a shot (or an admin) may delete or retype it (the server checks too).
  const lockedFor = (shot: Shot) => !isAdmin && shot.by && shot.by !== userId
    ? `Taken by ${shot.byName || 'another photographer'}: only they can delete it or change its type.` : '';
  const pendingKeys = new Set(pending.map(shotKey));
  // In the review, a choice counts only when it can be carried out now.
  const chooseType = (shot: Shot, code: string) => {
    if (busy || !canEdit || lockedFor(shot)) return;
    markReviewed(shot);
    void retag(shot, code);
  };
  // Keep: the shot is right as it is (its type already shows). Next one.
  const keep = (shot: Shot) => {
    if (busy) return;
    markReviewed(shot);
  };
  const remove = (shot: Shot) => {
    if (busy || !canEdit || lockedFor(shot)) return;
    markReviewed(shot);
    void change('delete', [shot]);
  };

  return (
    <section aria-label="Shoot gallery" className="mt-4 space-y-3 border-t-2 border-line pt-4">
      <ShotTypeBar listing={listing} current={shotType} onChange={onShotType} packageTypes={packageTypes}
        counts={counts} onEditMenu={onEditMenu} />
      {packageTypes.length > 0 && (
        <p role="status" className={`m-0 text-[11px] font-bold ${missing.length ? 'text-amber-700' : 'text-emerald-700'}`}>
          {missing.length
            ? `Package still needs: ${missing.map((code) => typeLabel(listing?.types, code)).join(', ')}.`
            : 'Every type in the package has a shot.'}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ink">
          <Images className="h-4 w-4 text-gold" /> Shots
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-[11px] font-bold text-neutral-600" role="status">
            {kept.length} {kept.length === 1 ? 'shot' : 'shots'}{deleted.length > 0 && ` · ${deleted.length} deleted`}
          </p>
          {pending.length > 0 && !reviewShot && (
            <button type="button" onClick={() => { setViewing(undefined); setReviewing(true); }}
              className="btn-tactile inline-flex min-h-9 items-center gap-1.5 bg-gold px-3 text-[10px] font-black uppercase tracking-wider text-on-gold cursor-pointer">
              Review {pending.length} new shot{pending.length === 1 ? '' : 's'}
            </button>
          )}
          <label className="inline-flex min-h-9 items-center gap-1.5 text-[11px] font-bold text-ink cursor-pointer">
            <input type="checkbox" checked={autoView} className="size-4"
              onChange={(event) => { setAutoView(event.target.checked); writeFlag(autoViewKey, event.target.checked); }} />
            Show new shots one by one, full screen
          </label>
          <input ref={cardInput} type="file" multiple accept={cardAccept} className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void addFromCard(files); }} />
          <button type="button" disabled={!!uploading} onClick={() => cardInput.current?.click()}
            title="For shots taken untethered: pick them from the memory card (or wherever you copied them). They get the type chosen above."
            className="btn-tactile inline-flex min-h-9 items-center gap-1.5 border border-gold px-3 text-[10px] font-black uppercase tracking-wider text-gold cursor-pointer disabled:opacity-60">
            <HardDriveUpload className="size-3.5" aria-hidden="true" />
            {uploading ? `Adding ${uploading.done} of ${uploading.total}…` : 'Add photos from card'}
          </button>
        </div>
      </div>
      <p className="m-0 text-[11px] text-neutral-600">
        {canEdit
          ? 'New shots appear a few seconds after you take them and show one by one: choose what each one is, or Delete. The Chooser only sees what is left.'
          : reason}
      </p>
      {kept.length === 0 && deleted.length > 0 && (
        <p role="alert" className="m-0 border border-amber-500 px-2 py-1 text-[11px] font-bold text-amber-700">
          All shots were deleted. Restore at least one, or take more, before Mark Done.
        </p>
      )}
      {live.error && <p role="alert" className="m-0 text-[11px] font-bold text-red-700">{live.error}</p>}

      {kept.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
          {kept.map((shot) => (
            <ShotTile key={shot.id} registrationId={registrationId} shot={shot} types={listing?.types}
              disabled={busy || !canEdit || !!lockedFor(shot)} locked={lockedFor(shot)}
              isNew={pendingKeys.has(shotKey(shot))} onOpen={() => { setReviewing(false); setViewing(shot.id); }} onDelete={() => remove(shot)} />
          ))}
        </div>
      ) : deleted.length === 0 && (
        <p className="m-0 border border-dashed border-line px-3 py-6 text-center text-xs text-neutral-600">No shots yet.</p>
      )}

      {deleted.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDeleted((open) => !open)} aria-expanded={showDeleted}
            className="text-[11px] font-black uppercase tracking-wider text-gold underline cursor-pointer">
            {showDeleted ? 'Hide' : 'Show'} deleted ({deleted.length})
          </button>
          {showDeleted && (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {deleted.map((shot) => (
                <ShotTile key={shot.id} registrationId={registrationId} shot={shot} types={listing?.types} deleted
                  disabled={busy || !canEdit || !!lockedFor(shot)} locked={lockedFor(shot)}
                  onRestore={() => void change('restore', [shot])} />
              ))}
            </div>
          )}
        </div>
      )}

      {reviewShot ? (
        <ShotViewer key="review" registrationId={registrationId} shots={[reviewShot]} index={0} canEdit={canEdit && !busy}
          review={pending.length} menu={menu} types={listing?.types} nextType={shotType} packageTypes={packageTypes}
          onMove={() => {}} onDelete={remove} onRetag={chooseType} onKeep={keep} onClose={() => setReviewing(false)} />
      ) : index >= 0 && (
        <ShotViewer registrationId={registrationId} shots={kept} index={index} canEdit={canEdit && !busy && !lockedFor(kept[index])}
          locked={lockedFor(kept[index])} menu={menu} types={listing?.types} nextType={shotType} packageTypes={packageTypes}
          onMove={(next) => setViewing(kept[next]?.id)}
          onDelete={(shot) => {
            // Stay on the same spot in the list: show the next shot (or the previous one at the end).
            setViewing(kept[index + 1]?.id ?? kept[index - 1]?.id);
            remove(shot);
          }}
          onRetag={chooseType}
          onClose={() => setViewing(undefined)} />
      )}
    </section>
  );
};

function TypeChip({ code, types, className = '' }: { code: string; types: ShotType[] | undefined; className?: string }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${code
      ? 'border-gold text-gold' : 'border-neutral-500 text-neutral-500'} ${className}`}>
      <Tags className="size-3 shrink-0" aria-hidden="true" /> {typeLabel(types, code)}
    </span>
  );
}

function ShotTile({ registrationId, shot, types, deleted = false, isNew = false, locked = '', disabled, onOpen, onDelete, onRestore }: {
  registrationId: string; shot: Shot; types: ShotType[] | undefined; deleted?: boolean; isNew?: boolean; locked?: string; disabled: boolean;
  onOpen?: () => void; onDelete?: () => void; onRestore?: () => void;
}) {
  const tile = useRef<HTMLElement>(null);
  const image = useAuthedImage(imageUrl(registrationId, shot, deleted), tile);
  return (
    <article ref={tile} className={`min-w-0 border bg-panel ${deleted ? 'border-dashed border-neutral-400 opacity-70' : 'border-line'}`}>
      <button type="button" onClick={onOpen} disabled={!onOpen || !image.src} aria-label={`View ${shot.name}`}
        className="relative block w-full cursor-pointer disabled:cursor-default">
        {image.src
          ? <img src={image.src} alt="" className={`aspect-[4/3] w-full object-contain bg-black ${deleted ? 'grayscale' : ''}`} />
          : <span className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-black text-[10px] text-neutral-400">
            {image.failed && <ImageOff size={16} />}{image.failed ? 'Unavailable' : 'Loading…'}
          </span>}
        {!deleted && <TypeChip code={shot.type} types={types} className="absolute left-1 top-1 bg-black/80" />}
        {isNew && <span className="absolute right-1 top-1 bg-gold px-1.5 py-0.5 text-[9px] font-black uppercase text-on-gold">New · to review</span>}
      </button>
      <div className="flex items-center justify-between gap-1 p-1">
        <span className="min-w-0 truncate font-mono text-[10px]" title={locked || shot.name}>
          {untagged(shot.name)}{shot.byName && <span className="ml-1 font-sans text-neutral-500">· {shot.byName}</span>}
        </span>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={disabled} aria-label={`Delete ${shot.name}`} title={locked || 'Delete this shot'}
            className="shrink-0 p-1 text-red-700 cursor-pointer disabled:opacity-30"><Trash2 size={14} /></button>
        )}
        {onRestore && (
          <button type="button" onClick={onRestore} disabled={disabled} aria-label={`Restore ${shot.name}`} title={locked || 'Restore this shot'}
            className="shrink-0 p-1 text-emerald-700 cursor-pointer disabled:opacity-30"><RotateCcw size={14} /></button>
        )}
      </div>
    </article>
  );
}

/**
 * One shot full screen. The menu on the left: Delete first, then the photographer's shot types
 * (the shot's type is lit; tapping another changes it). The eye hides the menu to see the whole photo.
 * Keys: Delete, 1–9 for the types in menu order, 0 for no type, H to hide the menu, ← → to move.
 * `review`: reviewing new shots (how many are left); a choice shows the next one, Keep (Enter) keeps
 * the shot as it is, Esc pauses. `locked`: someone else's shot (why it can't be changed here).
 */
function ShotViewer({ registrationId, shots, index, canEdit, review, locked = '', menu, types, nextType, packageTypes, onMove, onDelete, onRetag, onKeep, onClose }: {
  registrationId: string; shots: Shot[]; index: number; canEdit: boolean; review?: number; locked?: string;
  onKeep?: (shot: Shot) => void;
  menu: ShotType[]; types: ShotType[] | undefined; nextType: string; packageTypes: string[];
  onMove: (index: number) => void; onDelete: (shot: Shot) => void; onRetag: (shot: Shot, code: string) => void; onClose: () => void;
}) {
  const shot = shots[index];
  const frame = useRef<HTMLDivElement>(null);
  const image = useAuthedImage(imageUrl(registrationId, shot, false), frame);
  const [menuHidden, setMenuHidden] = useState(() => readFlag(menuHiddenKey, false));
  const toggleMenu = useCallback(() => setMenuHidden((hidden) => { writeFlag(menuHiddenKey, !hidden); return !hidden; }), []);
  // A shot whose type isn't on this photographer's menu still shows it.
  const options = useMemo(() => (shot.type && !menu.some((type) => type.code === shot.type)
    ? [...menu, ...(types?.filter((type) => type.code === shot.type) ?? [])] : menu), [shot.type, menu, types]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      else if (event.key === 'ArrowLeft' && index > 0) onMove(index - 1);
      else if (event.key === 'ArrowRight' && index < shots.length - 1) onMove(index + 1);
      else if (event.key === 'Delete' && canEdit) onDelete(shot);
      else if ((event.key === 'Enter' || event.key === ' ') && onKeep) { event.preventDefault(); onKeep(shot); }
      else if (event.key.toLowerCase() === 'h') toggleMenu();
      else if (canEdit && /^[0-9]$/.test(event.key)) {
        const number = Number(event.key);
        if (number === 0) onRetag(shot, '');
        else if (options[number - 1]) onRetag(shot, options[number - 1].code);
      }
    };
    // Capture phase, so the popup underneath doesn't also close on Esc.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, shots.length, shot, canEdit, options, onMove, onDelete, onRetag, onKeep, onClose, toggleMenu]);

  const nav = 'w-11 h-11 shrink-0 flex items-center justify-center border border-line bg-canvas text-ink cursor-pointer disabled:opacity-30';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Shot ${shot.name}`}
      className="theme-night no-print fixed inset-0 z-50 flex flex-col bg-black/95 p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        {review ? (
          <p className="m-0 min-w-0 truncate text-xs font-black uppercase tracking-wider text-gold">
            New shot · {review} to review · choose what it is
            <span className="ml-2 font-mono font-normal normal-case text-neutral-400">{untagged(shot.name)}</span>
          </p>
        ) : (
          <p className="m-0 min-w-0 truncate font-mono text-xs">
            {untagged(shot.name)} · {index + 1} of {shots.length}
            <span className="ml-2 text-neutral-400">Next shots: {typeLabel(types, nextType)}</span>
          </p>
        )}
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={toggleMenu} aria-pressed={!menuHidden}
            aria-label={menuHidden ? 'Show the menu' : 'Hide the menu to see the whole photo'}
            title={menuHidden ? 'Show the menu (H)' : 'Hide the menu (H)'} className={nav}>
            {menuHidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className={nav}><X size={18} /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 py-3">
        {!menuHidden && (
          <nav aria-label="Shot menu" className="flex w-48 shrink-0 flex-col gap-2 overflow-y-auto sm:w-56">
            <button type="button" disabled={!canEdit} onClick={() => onDelete(shot)}
              className="btn-tactile inline-flex min-h-14 items-center justify-center gap-2 border border-red-500 bg-red-700 px-3 text-sm font-black uppercase text-white cursor-pointer disabled:opacity-40">
              <Trash2 size={18} /> Delete
            </button>
            {onKeep && (
              <button type="button" onClick={() => onKeep(shot)}
                className="btn-tactile inline-flex min-h-12 items-center justify-center gap-2 border border-emerald-500 bg-emerald-700 px-3 text-xs font-black uppercase text-white cursor-pointer">
                Keep as {typeLabel(types, shot.type)} <span className="font-mono text-[10px] opacity-80">Enter</span>
              </button>
            )}
            {locked && <p className="m-0 text-[11px] text-amber-300">{locked}</p>}
            <p className="m-0 mt-2 text-[10px] font-black uppercase tracking-wider text-neutral-400">This shot is</p>
            <div role="radiogroup" aria-label="Shot type of this shot" className="flex flex-col gap-1.5">
              {options.map((type, position) => (
                <button key={type.id} type="button" role="radio" aria-checked={shot.type === type.code} disabled={!canEdit}
                  onClick={() => onRetag(shot, type.code)}
                  className={`flex min-h-11 items-center gap-2 border px-2.5 text-left text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-40 ${shot.type === type.code
                    ? 'border-gold bg-gold text-on-gold' : 'border-neutral-600 text-white hover:border-gold'}`}>
                  <span className="w-4 shrink-0 font-mono text-[10px] opacity-70">{position < 9 ? position + 1 : ''}</span>
                  <span className="min-w-0 flex-1">{type.name}</span>
                  {packageTypes.includes(type.code) && <span className="font-mono text-[9px] normal-case opacity-80">pkg</span>}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={!shot.type} disabled={!canEdit} onClick={() => onRetag(shot, '')}
                className={`flex min-h-11 items-center gap-2 border px-2.5 text-left text-xs font-black uppercase tracking-wide cursor-pointer disabled:opacity-40 ${!shot.type
                  ? 'border-gold bg-gold text-on-gold' : 'border-neutral-600 text-neutral-300 hover:border-gold'}`}>
                <span className="w-4 shrink-0 font-mono text-[10px] opacity-70">0</span> No type
              </button>
            </div>
          </nav>
        )}
        <div ref={frame} className="flex min-w-0 flex-1 items-center justify-center gap-2">
          {!review && (
            <button type="button" aria-label="Previous shot" disabled={index === 0} onClick={() => onMove(index - 1)} className={nav}>
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-center self-stretch">
            {image.src
              ? <img src={image.src} alt={shot.name} className="max-h-full max-w-full object-contain" />
              : <p className="text-xs">{image.failed ? 'This shot could not be loaded.' : 'Loading…'}</p>}
          </div>
          {!review && (
            <button type="button" aria-label="Next shot" disabled={index === shots.length - 1} onClick={() => onMove(index + 1)} className={nav}>
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </div>
      <p className="m-0 text-center text-[11px] text-neutral-400">
        {review
          ? 'Enter keeps it as it is · 1–9 another type (0 no type) · Delete · then the next new shot shows · H hide menu · Esc to pause'
          : 'Delete key to delete · 1–9 to set the type · 0 no type · H hide menu · ← → to move · Esc to close'}
      </p>
    </div>,
    document.body,
  );
}
