import type { MuaPerformanceReport } from '../admin/muaPerformance';

export interface MuaTeam {
  parentId?: string;
  allowSelf?: boolean;
  manage: boolean;
  canClaim: boolean;
  date: string;
  today: string;
  report?: MuaPerformanceReport;
  workload?: { pending: number; inProgress: number };
  artists: {
    id: string;
    name: string;
    disabled: boolean;
    parent: boolean;
    pending: number;
    inProgress: number;
    completed: number;
  }[];
}
