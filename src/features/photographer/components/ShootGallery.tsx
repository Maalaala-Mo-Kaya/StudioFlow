import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, HardDriveUpload, ImageOff, Images, RotateCcw, Trash2, X } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import { useWorkflowData, workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import { useAuthedImage } from '../../../hooks/useAuthedImage';
import { useToast } from '../../../context/ToastContext';
import { DataFeedback } from '../../../components/common/DataFeedback';

interface Shot { id: string; name: string; size: number; modified: number }
interface ShootData { photos: Shot[]; deleted: Shot[]; canEdit: boolean; reason: string; moved?: string[] }

/** Photos and the RAW formats StudioFlow keeps (they go to the client's RAW folder). */
const cardAccept = 'image/jpeg,image/png,.jpg,.jpeg,.png,.cr2,.cr3,.crw,.dng,.nef,.nrw,.arw,.raf,.orf,.rw2,.pef,.srw';
const photoFile = /\.(jpe?g|png|webp|gif|avif)$/i;

const imageUrl = (registrationId: string, shot: Shot, deleted: boolean) =>
  `${workflowApi}/shoot/${registrationId}/image/${shot.id}?${new URLSearchParams({ name: shot.name, ...(deleted ? { deleted: '1' } : {}) })}`;

/**
 * The shots the camera import has moved into the on-set client's folder. The linked
 * photographer deletes the ones that didn't come out well; they move into the client's
 * _DELETED folder (never off the disk) and can be restored until Mark Done. The Chooser
 * only ever sees the shots that are left.
 */
export const ShootGallery: React.FC<{ registrationId: string }> = ({ registrationId }) => {
  const { toast } = useToast();
  const live = useWorkflowData<ShootData>(`/shoot/${registrationId}/photos`, 5_000);
  // A delete or restore answer is newer than the last poll, until the next poll arrives.
  const [override, setOverride] = useState<{ base?: ShootData; data: ShootData }>();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string>();
  const [showDeleted, setShowDeleted] = useState(false);
  const data = override && override.base === live.data ? override.data : live.data;
  const { refresh } = live;
  const base = live.data;
  const cardInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number }>();

  // Photos shot untethered (to the memory card): add them straight to this client, one file at a
  // time. Files already in the client's folders (same name and size) are skipped by the server.
  const addFromCard = async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading({ done: 0, total: files.length });
    let savedPhotos = 0;
    let savedRaw = 0;
    let skipped = 0;
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      try {
        const response = await fetch(pb.buildURL(`${workflowApi}/shoot-upload/${registrationId}?${new URLSearchParams({ name: file.name })}`), {
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

  if (!data) {
    return <DataFeedback loading={live.loading} error={live.error} onRetry={refresh}
      loadingMessage="Loading shots…" className="mt-4 min-h-16 border-t-2 border-line pt-4" />;
  }
  const { photos, deleted, canEdit, reason } = data;
  const index = photos.findIndex((shot) => shot.id === viewing);

  return (
    <section aria-label="Shoot gallery" className="mt-4 border-t-2 border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="m-0 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-ink">
          <Images className="h-4 w-4 text-gold" /> Shots
        </h4>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-[11px] font-bold text-neutral-600" role="status">
            {photos.length} {photos.length === 1 ? 'shot' : 'shots'}{deleted.length > 0 && ` · ${deleted.length} deleted`}
          </p>
          <input ref={cardInput} type="file" multiple accept={cardAccept} className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(event) => { const files = [...(event.target.files ?? [])]; event.target.value = ''; void addFromCard(files); }} />
          <button type="button" disabled={!!uploading} onClick={() => cardInput.current?.click()}
            title="For shots taken untethered: pick them from the memory card (or wherever you copied them)"
            className="btn-tactile inline-flex min-h-9 items-center gap-1.5 border border-gold px-3 text-[10px] font-black uppercase tracking-wider text-gold cursor-pointer disabled:opacity-60">
            <HardDriveUpload className="size-3.5" aria-hidden="true" />
            {uploading ? `Adding ${uploading.done} of ${uploading.total}…` : 'Add photos from card'}
          </button>
        </div>
      </div>
      <p className="m-0 mt-1 text-[11px] text-neutral-600">
        {canEdit
          ? 'New shots appear here a few seconds after you take them. Delete the bad ones; the Chooser only sees what is left.'
          : reason}
      </p>
      {photos.length === 0 && deleted.length > 0 && (
        <p role="alert" className="m-0 mt-2 border border-amber-500 px-2 py-1 text-[11px] font-bold text-amber-700">
          All shots were deleted. Restore at least one, or take more, before Mark Done.
        </p>
      )}
      <DataFeedback refreshing={live.refreshing} error={live.error} onRetry={refresh} className="mt-2" />

      {photos.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
          {photos.map((shot) => (
            <ShotTile key={shot.id} registrationId={registrationId} shot={shot} disabled={busy || !canEdit}
              onOpen={() => setViewing(shot.id)} onDelete={() => void change('delete', [shot])} />
          ))}
        </div>
      ) : deleted.length === 0 && (
        <p className="m-0 mt-3 border border-dashed border-line px-3 py-6 text-center text-xs text-neutral-600">No shots yet.</p>
      )}

      {deleted.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowDeleted((open) => !open)} aria-expanded={showDeleted}
            className="text-[11px] font-black uppercase tracking-wider text-gold underline cursor-pointer">
            {showDeleted ? 'Hide' : 'Show'} deleted ({deleted.length})
          </button>
          {showDeleted && (
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {deleted.map((shot) => (
                <ShotTile key={shot.id} registrationId={registrationId} shot={shot} deleted disabled={busy || !canEdit}
                  onRestore={() => void change('restore', [shot])} />
              ))}
            </div>
          )}
        </div>
      )}

      {index >= 0 && (
        <ShotViewer registrationId={registrationId} shots={photos} index={index} canEdit={canEdit && !busy}
          onMove={(next) => setViewing(photos[next]?.id)}
          onDelete={(shot) => {
            // Stay on the same spot in the list: show the next shot (or the previous one at the end).
            setViewing(photos[index + 1]?.id ?? photos[index - 1]?.id);
            void change('delete', [shot]);
          }}
          onClose={() => setViewing(undefined)} />
      )}
    </section>
  );
};

function ShotTile({ registrationId, shot, deleted = false, disabled, onOpen, onDelete, onRestore }: {
  registrationId: string; shot: Shot; deleted?: boolean; disabled: boolean;
  onOpen?: () => void; onDelete?: () => void; onRestore?: () => void;
}) {
  const tile = useRef<HTMLElement>(null);
  const image = useAuthedImage(imageUrl(registrationId, shot, deleted), tile);
  return (
    <article ref={tile}className={`min-w-0 border bg-panel ${deleted ? 'border-dashed border-neutral-400 opacity-70' : 'border-line'}`}>
      <button type="button" onClick={onOpen} disabled={!onOpen || !image.src} aria-label={`View ${shot.name}`}
        className="block w-full cursor-pointer disabled:cursor-default">
        {image.src
          ? <img src={image.src} alt="" className={`aspect-[4/3] w-full object-contain bg-black ${deleted ? 'grayscale' : ''}`} />
          : <span className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-black text-[10px] text-neutral-400">
            {image.failed && <ImageOff size={16} />}{image.failed ? 'Unavailable' : 'Loading…'}
          </span>}
      </button>
      <div className="flex items-center justify-between gap-1 p-1">
        <span className="truncate font-mono text-[10px]" title={shot.name}>{shot.name}</span>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={disabled} aria-label={`Delete ${shot.name}`} title="Delete this shot"
            className="shrink-0 p-1 text-red-700 cursor-pointer disabled:opacity-30"><Trash2 size={14} /></button>
        )}
        {onRestore && (
          <button type="button" onClick={onRestore} disabled={disabled} aria-label={`Restore ${shot.name}`} title="Restore this shot"
            className="shrink-0 p-1 text-emerald-700 cursor-pointer disabled:opacity-30"><RotateCcw size={14} /></button>
        )}
      </div>
    </article>
  );
}

function ShotViewer({ registrationId, shots, index, canEdit, onMove, onDelete, onClose }: {
  registrationId: string; shots: Shot[]; index: number; canEdit: boolean;
  onMove: (index: number) => void; onDelete: (shot: Shot) => void; onClose: () => void;
}) {
  const shot = shots[index];
  const frame = useRef<HTMLDivElement>(null);
  const image = useAuthedImage(imageUrl(registrationId, shot, false), frame);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      else if (event.key === 'ArrowLeft' && index > 0) onMove(index - 1);
      else if (event.key === 'ArrowRight' && index < shots.length - 1) onMove(index + 1);
      else if (event.key === 'Delete' && canEdit) onDelete(shot);
    };
    // Capture phase, so the popup underneath doesn't also close on Esc.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, shots.length, shot, canEdit, onMove, onDelete, onClose]);

  const nav = 'w-11 h-11 shrink-0 flex items-center justify-center border border-line bg-canvas text-ink cursor-pointer disabled:opacity-30';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Shot ${shot.name}`}
      className="theme-night no-print fixed inset-0 z-50 flex flex-col bg-black/95 p-3 text-white">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 min-w-0 truncate font-mono text-xs">{shot.name} · {index + 1} of {shots.length}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" disabled={!canEdit} onClick={() => onDelete(shot)}
            className="btn-tactile inline-flex min-h-11 items-center gap-2 border border-red-500 bg-red-700 px-3 text-xs font-black uppercase text-white cursor-pointer disabled:opacity-40">
            <Trash2 size={16} /> Delete
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className={nav}><X size={18} /></button>
        </div>
      </div>
      <div ref={frame} className="flex min-h-0 flex-1 items-center justify-center gap-2 py-3">
        <button type="button" aria-label="Previous shot" disabled={index === 0} onClick={() => onMove(index - 1)} className={nav}>
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center self-stretch">
          {image.src
            ? <img src={image.src} alt={shot.name} className="max-h-full max-w-full object-contain" />
            : <p className="text-xs">{image.failed ? 'This shot could not be loaded.' : 'Loading…'}</p>}
        </div>
        <button type="button" aria-label="Next shot" disabled={index === shots.length - 1} onClick={() => onMove(index + 1)} className={nav}>
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="m-0 text-center text-[11px] text-neutral-400">← → to move · Delete key to delete · Esc to close</p>
    </div>,
    document.body,
  );
}
