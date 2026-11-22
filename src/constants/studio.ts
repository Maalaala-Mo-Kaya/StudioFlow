import type { StaffRole } from '../types';

export const STUDIO_INFO = {
  name: 'Hi-Light Studio',
  shortCode: 'HL',
  tagline: '"Brings out the BEST in YOU"',
  address: 'P. del Rosario St., Cebu City (near RD Pawnshop, opposite USC-Main)',
  shortAddress: 'P. del Rosario St., Cebu',
  hours: 'Studio Opens: 9:00 AM – 6:00 PM',
  phone: '032-2540886',
  facebook: 'www.fb.com/hi-light studio',
} as const;

export const REGISTRATION_TERMS_CLAUSES: ReadonlyArray<string> = [
  'Hair and make-up are included only when listed in the selected package or purchased as an add-on.',
  'Strictly NO Make-up retouch inside the studio.',
  'Check your schedules before paying (Date & Time of pictorial).',
  'Please keep this receipt for verification and claiming of your pictures.',
  'Softcopy wait via email (Google Drive) — only raw selected files to be uploaded.',
  'Processing of pictures will take 6 to 8 weeks after the approval of proofs; unpaid balances will not be processed unless settled.',
  'The studio shall be free from any liabilities for unclaimed pictures after 30 days from scheduled release.',
  'Downpayment is NON-REFUNDABLE.',
];

export const RECEIPT_TERMS_CLAUSES: ReadonlyArray<string> = [
  "The client agrees once they had seen and chosen their pictures and indicated the file names in the proofing form and he/she decided to do a retake, she/he will pay the full amount of the package again.",
  'The client agrees to pay initial payment of half or full amount of the package chosen upon pictorial and pay the remaining balance first once the pictures are ready for printing. Pictures will only be printed after receipt of final/full payment within the aforementioned time period.',
  "Hi-Light studio takes ownership of the pictures and image files and may request the right to use for the production of the company's advertising materials such as tarpaulins and studio displays.",
  'The pictures will be available for pick up GENERALLY within 75 WORKING DAYS from the date of the pictorial but no later than 120 working days.',
  'Hi-Light studio has the right to dispose unclaimed jobs after 365 days from the date of its completion. ALL SOFTCOPIES WILL BE DISPOSED A YEAR AFTER FROM THE DATE OF THE PICTORIAL and NO REFUND for UNCLAIMED PICTURES.',
  'Soft copies are provided upon delivery of the pictures through google drive or USB.',
  'Upon signing this Job Order Receipt the client agrees with the foregoing terms and conditions.',
];

export const PROTECTED_SYSTEM_USERNAMES: ReadonlyArray<string> = [
  'admin',
  'cashier',
  'photographer',
];


export const ADMIN_STATION_LINKS: ReadonlyArray<{
  id: string;
  label: string;
}> = [
  { id: 'admin', label: 'Admin' },
  { id: 'cashier', label: 'Cashier' },
  { id: 'photographer', label: 'Queue' },
  { id: 'mua', label: 'MUA' },
  { id: 'chooser', label: 'Chooser' },
  { id: 'register', label: 'Form' },
];

export const ROLE_DEFAULT_ROUTE: Record<StaffRole, string> = {
  admin: 'admin',
  cashier: 'cashier',
  photographer: 'photographer',
  mua: 'mua',
  chooser: 'chooser',
};

export const VALID_APP_ROUTES = [
  'register',
  'login',
  'cashier',
  'photographer',
  'admin',
  'mua',
  'chooser',
] as const;

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'card', label: 'Bank / Card' },
] as const;
