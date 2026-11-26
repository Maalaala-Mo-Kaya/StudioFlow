import { DataFeedback } from '../../components/common/DataFeedback';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderPlus, HardDrive, CornerLeftUp, X, Check } from 'lucide-react';
import { workflowError } from '../../hooks/useWorkflowData';
import { browseFolders, createFolder, type FolderListing } from './cameraApi';

interface FolderPickerModalProps {
  initialPath: string;
  onPick: (path: string) => void;
  onClose: () => void;
}

/** Browses folders on the server PC (where PocketBase runs), not on this device. */
export const FolderPickerModal: React.FC<FolderPickerModalProps> = ({ initialPath, onPick, onClose }) => {
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(true);
  const [failedPath, setFailedPath] = useState<string>();

  const open = async (path: string, fallback = true) => {
    setBusy(true);
    setError('');
    setFailedPath(undefined);
    try {
      setListing(await browseFolders(path));
      setError('');
    } catch (err) {
      console.error('Failed to browse camera folders:', err);
      setError('Could not open that folder.');
      setFailedPath(path);
      if (fallback && path) {
        try { setListing(await browseFolders('')); }
        catch (error) { console.error('Failed to list camera folder roots:', error); }
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void open(initialPath);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // Load once for the folder the picker opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!listing?.path || !newName.trim()) return;
    setBusy(true);
    setError('');
    setFailedPath(undefined);
    try {
      setListing(await createFolder(listing.path, newName.trim()));
      setNewName('');
      setError('');
    } catch (err) {
      setError(workflowError(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(0,0,0,0.6)]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-xl max-h-[85dvh] flex flex-col bg-panel border-2 border-line shadow-lux-gold"
      >
        <div className="flex items-center justify-between gap-3 p-4 border-b-2 border-line">
          <div className="min-w-0">
            <h3 id="folder-picker-title" className="text-sm font-black uppercase tracking-wider text-ink m-0">Choose Camera Folder</h3>
            <p className="text-[11px] text-neutral-500">Folders on the server PC</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-tactile p-2 bg-obsidian text-gold hover:bg-gold hover:text-on-gold cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-300 bg-canvas">
          <button
            type="button"
            disabled={!listing || listing.parent === null || busy}
            onClick={() => listing && listing.parent !== null && void open(listing.parent)}
            className="btn-tactile shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CornerLeftUp className="w-3.5 h-3.5" /> Up
          </button>
          <span className="font-mono text-xs text-ink truncate" title={listing?.path}>{listing?.path || 'This PC'}</span>
        </div>

        <ul className="flex-1 min-h-[200px] overflow-y-auto p-2" aria-busy={busy}>
          {(busy || error || listing?.folders.length === 0) && <li className="p-3 text-center">
            <DataFeedback loading={busy} error={error} loadingMessage="Loading folders…"
              emptyMessage="No subfolders here."
              onRetry={failedPath === undefined ? undefined : () => void open(failedPath)} />
          </li>}
          {listing?.folders.map((folder) => (
            <li key={folder.path}>
              <button
                type="button"
                disabled={busy} onClick={() => void open(folder.path, false)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-gold-wash cursor-pointer"
              >
                {listing.path ? <Folder className="w-4 h-4 text-gold shrink-0" /> : <HardDrive className="w-4 h-4 text-gold shrink-0" />}
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))}
        </ul>

        {listing?.path && (
          <form onSubmit={makeFolder} className="flex gap-2 px-4 py-3 border-t border-neutral-300">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New folder name, e.g. Camera1"
              aria-label="New folder name"
              className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 border border-neutral-400 bg-canvas focus:bg-panel text-xs"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="btn-tactile shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
            >
              <FolderPlus className="w-3.5 h-3.5" /> Create
            </button>
          </form>
        )}

        <div className="flex justify-end gap-2 p-4 border-t-2 border-line">
          <button type="button" onClick={onClose} className="btn-tactile px-4 py-2 border border-neutral-400 text-ink text-xs font-black uppercase tracking-wider cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={!listing?.path || busy}
            onClick={() => listing?.path && onPick(listing.path)}
            className="btn-tactile inline-flex items-center gap-1.5 px-4 py-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" /> Use This Folder
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
