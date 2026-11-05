import type { Registration } from '../types';

export interface ParsedRosterRow {
  full_name: string;
  student_id: string;
  section: string;
  email: string;
  mobile_number: string;
}

/**
 * Parses raw CSV/text lines into structured student roster items.
 * Expected format: `Full Name, Student ID, Section, Email, Mobile`
 */
export function parseRosterCsv(csvText: string): ParsedRosterRow[] {
  if (!csvText.trim()) return [];
  return csvText
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((parts) => parts.length >= 1 && Boolean(parts[0]))
    .map((parts) => ({
      full_name: parts[0],
      student_id: parts[1] || '',
      section: parts[2] || '',
      email: parts[3] || '',
      mobile_number: parts[4] || '',
    }));
}

/**
 * Generates and downloads a daily accounting CSV report from registrations.
 */
export function exportRegistrationsToCsv(registrations: Registration[]): void {
  const headers = [
    'Job Order No',
    'Queue No',
    'Family Name',
    'Given Name',
    'School',
    'Course',
    'Section',
    'Mobile',
    'Package',
    'Total Amount',
    'Paid Amount',
    'Balance',
    'Status',
    'Payment Status',
    'Prepared By',
    'Date Registered',
  ];

  const rows = registrations.map((r) => [
    `"${r.job_order_no || ''}"`,
    r.queue_number || '',
    `"${r.family_name}"`,
    `"${r.given_name}"`,
    `"${r.expand?.organization?.name || ''}"`,
    `"${r.expand?.course?.name || r.course || ''}"`,
    `"${r.section || ''}"`,
    `"${r.mobile_number}"`,
    `"${r.expand?.package?.code || ''}"`,
    r.total_amount,
    r.paid_amount,
    r.balance,
    r.status,
    r.payment_status,
    `"${r.prepared_by || ''}"`,
    `"${r.created}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `StudioFlow_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  link.click();
  URL.revokeObjectURL(url);
}
