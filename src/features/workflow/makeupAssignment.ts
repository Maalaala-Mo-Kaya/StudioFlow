export const makeupStateLabels = {
  waiting: 'Waiting', claimed: 'Claimed', in_progress: 'In progress', completed: 'Completed',
};

interface MakeupService {
  source: 'package' | 'add_on' | 'admin' | 'legacy';
  name: string;
  defaultService?: boolean;
  types?: { id: string; name: string }[];
}

export interface MakeupAssignment {
  id: string;
  rowKey?: string;
  name: string;
  studentId: string;
  jobOrder: string;
  packageName: string;
  service?: string;
  services?: MakeupService[];
  state: keyof typeof makeupStateLabels;
  look?: string;
  lookNote?: string;
  version?: number;
  artistId: string;
  artistName: string;
  completedAt: string;
  eligible?: boolean;
}

export function requiresConfirmation(row: MakeupAssignment) {
  return !!row.services?.length && row.services.every((service) => service.defaultService);
}
