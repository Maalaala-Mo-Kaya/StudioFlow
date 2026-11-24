import { useState } from 'react';
import { pb } from '../../../db/pocketbase';

interface CashierEditRecord {
  id: string;
  actor_id: string;
  actor_name: string;
  role: string;
  created: string;
  changes: { field: string; before: unknown; after: unknown }[];
}

const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

const label: Record<string, string> = {
  package: 'Package', organization: 'School / Organization', course: 'Course', level: 'Academic level',
  client_org: 'Client organization', student_id: 'Student ID', total_amount: 'Total billed',
};

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export function CashierEditHistory({ registrationId }: { registrationId: string }) {
  const [entries, setEntries] = useState<CashierEditRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setEntries(await pb.collection('cashier_registration_edits').getFullList<CashierEditRecord>({
        filter: pb.filter('registration = {:id}', { id: registrationId }), sort: '-created,-id', cache: 'no-store',
      }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="border border-line p-3" onToggle={(event) => {
      if (event.currentTarget.open && !entries) void load();
    }}>
      <summary className="cursor-pointer font-black uppercase tracking-wide">Cashier Edit History</summary>
      {loading && <p role="status" className="mt-2">Loading history…</p>}
      {failed && <p role="alert" className="mt-2 text-red-600">Could not load edit history. Close and reopen this section to retry.</p>}
      {entries?.length === 0 && <p className="mt-2">No cashier edits recorded.</p>}
      {entries?.map((entry) => (
        <details key={entry.id} className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer">
            <strong>{entry.actor_name}</strong> · <span className="capitalize">{entry.role}</span> · {dateFormat.format(new Date(entry.created.replace(' ', 'T')))}
          </summary>
          <p className="my-2 text-neutral-600">Staff account {entry.actor_id}</p>
          <dl className="space-y-2">
            {entry.changes.map((change) => (
              <div key={change.field} className="border border-line p-2">
                <dt className="font-bold capitalize">{label[change.field] ?? change.field.replaceAll('_', ' ')}</dt>
                <dd className="mt-1 grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0"><strong>Previous</strong><p className="whitespace-pre-wrap break-all">{formatValue(change.before)}</p></div>
                  <div className="min-w-0"><strong>Updated</strong><p className="whitespace-pre-wrap break-all">{formatValue(change.after)}</p></div>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </details>
  );
}
