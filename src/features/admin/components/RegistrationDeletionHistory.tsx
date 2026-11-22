import { useState } from 'react';
import { useWorkflowData } from '../../../hooks/useWorkflowData';

interface DeletionEntry {
  id: string;
  name: string;
  deletedAt: string;
  deletedBy: string;
  deletedById: string;
  reason: string;
  previousStatus: string;
}

export function RegistrationDeletionHistory() {
  const [open, setOpen] = useState(false);
  return (
    <details className="border-2 border-line bg-panel p-4" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer font-mono text-xs font-black uppercase tracking-wider">Registration deletion history</summary>
      {open && <DeletionHistoryEntries />}
    </details>
  );
}

function DeletionHistoryEntries() {
  const [page, setPage] = useState(1);
  const { data, error } = useWorkflowData<{ items: DeletionEntry[]; hasNext: boolean }>(`/registration-deletions?page=${page}`);
  return (
    <div className="mt-4 space-y-3 text-sm">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!data && !error && <p role="status">Loading deletion history…</p>}
      {data?.items.length === 0 && <p>No registrations deleted.</p>}
      {data?.items.map((entry) => (
        <article key={entry.id} className="space-y-1 border-t border-line pt-3">
          <p className="font-bold">{entry.name} <span className="break-all font-mono text-xs text-neutral-600">{entry.id}</span></p>
          <p className="break-words">{entry.reason}</p>
          <p className="break-words text-xs text-neutral-600">
            {new Date(entry.deletedAt.replace(' ', 'T')).toLocaleString('en-PH', {
              timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
            })} · {entry.deletedBy} ({entry.deletedById}) · {entry.previousStatus.replaceAll('_', ' ')}
          </p>
        </article>
      ))}
      {(page > 1 || data?.hasNext) && (
        <nav aria-label="Deletion history pages" className="flex items-center gap-3 text-xs">
          <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className="border border-line px-3 py-2 disabled:opacity-50">Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={!data?.hasNext} onClick={() => setPage(page + 1)} className="border border-line px-3 py-2 disabled:opacity-50">Next</button>
        </nav>
      )}
    </div>
  );
}
