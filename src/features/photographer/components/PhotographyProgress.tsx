import type { ReactNode } from 'react';
import type { PhotographyTask, Registration } from '../../../types';
import { activePhotographyTasks, photographyStatus, taskStatus } from '../photographyTasks';

export function PhotographyProgress({ registration, audit = false, action }: {
  registration: Registration;
  audit?: boolean;
  action?: (task: PhotographyTask) => ReactNode;
}) {
  const active = activePhotographyTasks(registration);
  const tasks = audit ? registration.photography?.tasks ?? [] : active;
  if (!tasks.length) return null;
  return (
    <div className="my-2 space-y-2 border border-line p-2.5 font-sans text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <strong>{photographyStatus(registration)}</strong>
        <span>{active.filter((task) => task.status === 'completed').length} of {active.length} completed</span>
      </div>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="border-t border-neutral-500/25 pt-1.5">
            <p><strong>{task.name}</strong> · {taskStatus(task)}</p>
            {(task.photographerName || audit) && <p>{task.photographerName || 'Unassigned'}</p>}
            {audit && task.completedAt && <p>{new Date(task.completedAt).toLocaleString()}</p>}
            {audit && task.assignments?.map((entry) => (
              <p key={entry.at}>Reassigned from {entry.fromName || 'unassigned'} to {entry.toName} · {new Date(entry.at).toLocaleString()}</p>
            ))}
            {action?.(task)}
          </li>
        ))}
      </ul>
    </div>
  );
}
