import type { MouseEventHandler } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export const recordActionGroup = 'inline-flex shrink-0 items-center gap-2';

export function RecordActionButton({ variant, recordName, onClick, disabled }: {
  variant: 'edit' | 'delete';
  recordName: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  const destructive = variant === 'delete';
  const label = destructive ? 'Delete' : 'Edit';
  const Icon = destructive ? Trash2 : Pencil;
  return (
    <button
      type="button"
      title={label}
      aria-label={`${label} ${recordName}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      className={`btn-tactile inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm border bg-panel p-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
        destructive
          ? 'border-red-600 text-red-700 enabled:hover:bg-red-700 enabled:hover:text-white focus-visible:outline-red-600'
          : 'border-line text-gold-soft enabled:hover:border-gold enabled:hover:bg-gold-wash focus-visible:outline-gold'
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
