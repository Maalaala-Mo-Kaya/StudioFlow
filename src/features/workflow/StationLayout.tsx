import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

export interface StationStudent {
  id: string;
  name: string;
  studentId: string;
  jobOrder: string;
  school: string;
  course: string;
  packageName: string;
  photographyComplete: boolean;
  queueNumber: number | null;
}

export const stationCard = 'bg-panel border-2 border-line shadow-lux p-4 sm:p-5';
export const stationButton = 'btn-tactile inline-flex items-center justify-center gap-2 min-h-10 px-3 py-2 border border-line bg-gold text-on-gold font-black text-xs uppercase tracking-wide cursor-pointer disabled:opacity-40 disabled:cursor-default';

export function StationLayout({ title, badge, liveLabel, description, refresh, actions, embedded, compactHeader, children }: {
  title: ReactNode;
  badge?: string;
  liveLabel?: string;
  description?: string;
  refresh: () => void;
  actions?: ReactNode;
  embedded?: boolean;
  compactHeader?: boolean;
  children: ReactNode;
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const liveStatus = liveLabel && (
    <span className="inline-flex items-center gap-1.5 border border-emerald-700 bg-emerald-950/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
      <span aria-hidden="true" className="size-1.5 bg-emerald-400 motion-safe:animate-status-pulse" />{liveLabel}
    </span>
  );
  return (
    <section className={embedded ? compactHeader ? 'min-w-0 space-y-4' : 'space-y-6' : 'w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 space-y-6'}>
      <header className={`items-center border-line bg-obsidian ${compactHeader
        ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-3 border px-4 py-3 text-ink sm:px-5'
        : 'animate-enter flex flex-wrap justify-between gap-4 border-2 p-5 text-white shadow-lux-gold sm:p-6'}`}>
        <div className="min-w-0">
          {!compactHeader && (badge || liveStatus) && <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {badge && <span className="bg-gold px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-widest text-on-gold">{badge}</span>}
            {liveStatus}
          </div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Heading className={`font-black uppercase tracking-tight sm:text-2xl ${compactHeader ? 'text-lg leading-tight' : 'text-xl text-white'}`}>{title}</Heading>
            {compactHeader && liveStatus}
          </div>
          {description && <p className="mt-1 text-xs text-neutral-400">{description}</p>}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2.5">
          {actions}
          <button type="button" onClick={refresh} className={`${stationButton} min-h-11 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold`}>
            <RotateCw className="size-4" aria-hidden="true" /> Sync
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}

export function StationStudentDetails({ student }: { student: StationStudent }) {
  return (
    <div className="min-w-0 break-words">
      <p className="font-mono text-xs font-bold text-gold-soft">Job order {student.jobOrder || student.id}{student.studentId && ` · ID ${student.studentId}`}</p>
      <h3 className="text-lg font-black uppercase">{student.name}</h3>
      <p className="text-sm">{[student.school, student.course].filter(Boolean).join(' · ')}</p>
      <p className="text-sm font-bold mt-1">{student.packageName}</p>
    </div>
  );
}
