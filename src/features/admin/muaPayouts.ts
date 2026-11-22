// MUA payouts (server: pb_hooks/studio_mua_payouts.js). The client pays the studio everything; the
// studio pays the makeup artists. Amounts are pesos.

/** A service an artist completed, with what they earned for it. */
export interface MuaPayoutLine {
  completionId: string;
  artistId: string;
  artistName: string;
  /** Completion day (Asia/Manila, YYYY-MM-DD). */
  date: string;
  completedAt: string;
  service: string;
  /** Sold price less its MUA discount share, plus adjustments. */
  earned: number;
  /** Why the amount needs an admin's review (then it is not paid out); '' when verified. */
  review: string;
  payoutId: string;
  payoutNo: string;
  paidAt: string;
  jobId: string;
  jobOrder: string;
  client: string;
  /** School code, or "Walk-in · session". */
  group: string;
  status: string;
  /** The client's order is fully paid. */
  paidInFull: boolean;
  balance: number;
}

/** A shared MUA charge (e.g. Wardrobe): money for the MUA team as a whole, split outside the system. */
export interface MuaSharedLine {
  jobId: string;
  jobOrder: string;
  client: string;
  group: string;
  status: string;
  paidInFull: boolean;
  balance: number;
  /** Order date (Asia/Manila). */
  date: string;
  item: string;
  amount: number;
}

export interface MuaPayout {
  id: string;
  payoutNo: string;
  artistId: string;
  artistName: string;
  from: string;
  to: string;
  amount: number;
  lines: { completionId: string; date: string; jobOrder: string; client: string; service: string; earned: number }[];
  note: string;
  paidBy: string;
  paidAt: string;
  voidedAt: string;
  voidedBy: string;
  voidReason: string;
}

export interface MuaPayoutReport {
  from: string;
  to: string;
  lines: MuaPayoutLine[];
  shared: MuaSharedLine[];
  /** Payouts recorded in the period (voided ones included). */
  payouts: MuaPayout[];
}

export interface MuaArtistTotals {
  artistId: string;
  artistName: string;
  clients: number;
  services: number;
  earned: number;
  paid: number;
  unpaid: number;
  /** Unpaid with a verified amount: what "Mark as paid" would record. */
  payable: number;
  /** Earned on orders the client has fully paid. */
  clientPaid: number;
  review: number;
  lines: MuaPayoutLine[];
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Per-artist totals, by name. */
export function artistTotals(lines: MuaPayoutLine[]): MuaArtistTotals[] {
  const byArtist = new Map<string, MuaArtistTotals & { jobs: Set<string> }>();
  for (const line of lines) {
    const row = byArtist.get(line.artistId) ?? {
      artistId: line.artistId, artistName: line.artistName, clients: 0, services: 0, earned: 0, paid: 0,
      unpaid: 0, payable: 0, clientPaid: 0, review: 0, lines: [], jobs: new Set<string>(),
    };
    row.jobs.add(line.jobId);
    row.services += 1;
    row.earned += line.earned;
    if (line.payoutNo) row.paid += line.earned;
    else {
      row.unpaid += line.earned;
      if (!line.review && line.earned > 0) row.payable += line.earned;
    }
    if (line.paidInFull) row.clientPaid += line.earned;
    if (line.review) row.review += 1;
    row.lines.push(line);
    byArtist.set(line.artistId, row);
  }
  return [...byArtist.values()]
    .map(({ jobs, ...row }) => ({
      ...row, clients: jobs.size, earned: round(row.earned), paid: round(row.paid), unpaid: round(row.unpaid),
      payable: round(row.payable), clientPaid: round(row.clientPaid),
    }))
    .sort((a, b) => a.artistName.localeCompare(b.artistName) || a.artistId.localeCompare(b.artistId));
}

export function sharedTotals(shared: MuaSharedLine[]) {
  const total = round(shared.reduce((sum, line) => sum + line.amount, 0));
  const clientPaid = round(shared.filter((line) => line.paidInFull).reduce((sum, line) => sum + line.amount, 0));
  const byItem = new Map<string, number>();
  for (const line of shared) byItem.set(line.item, round((byItem.get(line.item) ?? 0) + line.amount));
  return { total, clientPaid, byItem: [...byItem.entries()].sort((a, b) => a[0].localeCompare(b[0])) };
}

/** "Nov 1 – Nov 15, 2026", or one day. */
export function periodLabel(from?: string, to?: string) {
  const format = (day: string, year: boolean) => new Date(day + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}),
  });
  if (!from && !to) return 'All dates';
  if (from && to) return from === to ? format(from, true) : `${format(from, false)} – ${format(to, true)}`;
  return from ? `From ${format(from, true)}` : `Until ${format(to as string, true)}`;
}
