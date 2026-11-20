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
export const stationGrid = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5';

export function StationLayout({ title, refresh, embedded, children }: {
  title: string; refresh: () => void; embedded?: boolean; children: ReactNode;
}) {
  return (
    <section className={embedded ? 'space-y-6' : 'w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 space-y-6'}>
      <header className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6 bg-obsidian border-b-2 border-gold shadow-lux-gold text-white">
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{title}</h1>
        <button type="button" onClick={refresh} className={stationButton}><RotateCw size={14} /> Sync</button>
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
