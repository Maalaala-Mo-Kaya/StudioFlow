export type StaffRole = 'admin' | 'cashier' | 'photographer' | 'mua' | 'chooser';

export interface StaffUser {
  id: string;
  username: string;
  email?: string;
  name: string;
  role: StaffRole;
  verified?: boolean;
  disabled?: boolean;
  created?: string;
}

export type RegistrationStatus =
  | 'pending_payment'
  | 'paid'
  | 'shooting'
  | 'done_shooting'
  | 'completed'
  | 'ready_for_pickup'
  | 'released'
  | 'cancelled';

export type FramingStatus =
  | 'none'
  | 'pending_framing'
  | 'in_production'
  | 'framed'
  | 'ready_for_pickup'
  | 'released';

/** Production statuses an admin can set; "released" is only set by the cashier's Release step. */
export type ProductionStatus = Exclude<FramingStatus, 'released'>;

/** Reply of POST /api/studioflow/production-status. */
export interface ProductionUpdateResult {
  updated: number;
  unchanged: number;
  skipped: { cancelled: number; released: number; unpaid: number; notShot: number; missing: number };
}

export type PhotoStatus =
  | 'pending_shoot'
  | 'shot_raw'
  | 'client_selected'
  | 'ready_to_print';

export type PaymentStatus = 'unpaid' | 'downpayment' | 'fully_paid';
export type PaymentType = 'full' | 'downpayment';

export interface Organization {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
  /** Don't ask this school's students for a preferred makeup look. */
  makeup_look_off?: boolean;
}

export interface Level {
  id: string;
  organization: string;
  name: string;
  order?: number;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
}

export interface AssignSchoolCourse {
  schoolId: string;
  /** An existing level (from any school; the server copies it to this school by name). */
  levelId?: string;
  /** A level this school does not have yet, e.g. "Elementary". Used when levelId is empty. */
  levelName?: string;
  courseId?: string;
  name: string;
  code: string;
}

export interface SchoolCourse {
  id: string;
  school_id: string;
  course_id: string;
  level: string;
  expand?: { course_id?: Course };
}

export type ClientKind = 'school' | 'walkin';

/** What a walk-in client books. on_location sessions ask for the event date and venue. */
export interface SessionType {
  id: string;
  name: string;
  code?: string;
  on_location?: boolean;
  is_active?: boolean;
  order?: number;
  /** Don't ask clients of this session type for a preferred makeup look. */
  makeup_look_off?: boolean;
}

/** Studio-wide switches (one record, key = main). */
export interface StudioSettings {
  id: string;
  key: string;
  school_enabled: boolean;
  walkin_enabled: boolean;
  walkin_terms?: string[] | null;
  /** Text the cashier sends when an order is ready; see utils/pickupMessage.ts for placeholders. */
  pickup_message?: string;
  /** Ask the preferred makeup look at the kiosk (school / walk-in clients). */
  makeup_look_school?: boolean;
  makeup_look_walkin?: boolean;
}

export type RevenueCategory = 'studio' | 'mua';
export type Gender = 'male' | 'female';

/** Centavos, as saved on a job order. */
export interface RevenueSplit {
  studio: number;
  mua: number;
  unallocated: number;
}

export interface Package {
  revenue_category?: RevenueCategory | '';
  id: string;
  code: string;
  name: string;
  amount: number;
  description?: string;
  inclusions?: string[] | string;
  photo_selection_limit?: number;
  requires_mua?: boolean;
  is_active?: boolean;
  /** Which kiosk form offers it: school, walk-in, or both. Empty = school. */
  client_kind?: ClientKind | 'both' | '';
}

export interface AddOn {
  default_when_no_mua?: boolean;
  revenue_category?: RevenueCategory | '';
  id: string;
  code?: string;
  name: string;
  amount: number;
  requires_mua?: boolean;
  is_active?: boolean;
  /** Which kiosk form offers it; empty means both (unlike packages, where empty means school). */
  client_kind?: ClientKind | 'both' | '';
}

export interface RegistrationAddOn {
  auto_applied?: boolean;
  revenue_category?: RevenueCategory | '';
  id?: string;
  code?: string;
  name: string;
  amount: number;
  quantity?: number;
}

export interface MasterListItem {
  id: string;
  organization?: string;
  level?: string;
  course?: string;
  student_id?: string;
  full_name: string;
  email?: string;
  mobile_number?: string;
  section?: string;
}

export interface Registration {
  id: string;
  job_order_no: string | null;
  pictorial_date?: string;
  queue_number: number | null;
  family_name: string;
  given_name: string;
  gender?: Gender | '';
  middle_name?: string;
  student_id?: string;
  /** Empty on older records = school. */
  client_kind?: ClientKind | '';
  session_type?: string;
  event_date?: string;
  event_venue?: string;
  client_org?: string;
  organization?: string;
  level?: string;
  course?: string;
  department?: string;
  section?: string;
  mobile_number: string;
  email?: string;
  package: string;
  /** What the client bought, frozen at sale: price, name and package contents. */
  package_snapshot?: {
    id: string; code: string; name: string; amount?: number; revenue_category?: RevenueCategory | '';
    inclusions?: string[]; photo_selection_limit?: number;
  } | null;
  add_ons?: RegistrationAddOn[];
  other_fees?: number;
  revenue_terms?: RevenueSplit | null;
  revenue_review?: { mua: number; reason: string; by: string; at: string } | null;
  revenue_discount?: { studio: number; mua: number; percentage?: number; reason: string; by: string; byId?: string; at: string } | null;
  total_amount: number;
  paid_amount: number;
  balance: number;
  payment_type?: PaymentType;
  payment_status: PaymentStatus;
  status: RegistrationStatus;
  signature?: string;
  signatureDataUrl?: string;
  prepared_by?: string;
  terms_accepted?: boolean;
  notes?: string;
  framing_status?: FramingStatus;
  /** Set by the server when photography finishes. */
  shoot_completed?: boolean;
  photo_status?: PhotoStatus;
  makeup_service?: string;
  /** Preferred look from the kiosk: full | light | grooming (empty = not asked). */
  makeup_look?: string;
  makeup_look_note?: string;
  makeup_state?: '' | 'claimed' | 'in_progress' | 'completed';
  makeup_artist?: string;
  makeup_completed_at?: string;
  claimed_by?: string;
  released_at?: string;
  /** Server-owned: total refunded. paid_amount is already net of refunds. */
  refunded_amount?: number;
  /** Server-owned cancellation record (Cancel / Restore routes). */
  cancelled_at?: string;
  cancelled_by?: string;
  cancel_reason?: string;
  status_before_cancel?: string;
  restored_at?: string;
  restored_by?: string;
  /** Server-owned: when the order became ready for pickup (empty while not ready). */
  ready_at?: string;
  /** Server-owned: the last time staff told the client the order is ready, and who. */
  pickup_notified_at?: string;
  pickup_notified_by?: string;
  pickup_notify_count?: number;
  created: string;
  updated: string;
  // expanded relations
  expand?: {
    organization?: Organization;
    level?: Level;
    course?: Course;
    package?: Package;
    session_type?: SessionType;
  };
}

export interface PaymentRecord {
  id: string;
  registration: string;
  amount: number;
  payment_type: 'initial' | 'full' | 'additional' | 'balance_settlement';
  payment_method: 'cash' | 'gcash' | 'maya' | 'card';
  cash_tendered?: number;
  change_amount?: number;
  cashier_id?: string;
  cashier_name?: string;
  receipt_no?: string;
  client_key?: string;
  balance_before?: number;
  balance_after?: number;
  remarks?: string;
  /** "refunded" only on old records; new refunds are separate RefundRecords. */
  status?: 'completed' | 'voided' | 'refunded';
  /** Set when the payment was voided (who, when, why). */
  voided_at?: string;
  voided_by?: string;
  void_reason?: string;
  created: string;
}

/** Money given back to a client (RF-000001…), dated when it was given back. */
export interface RefundRecord {
  id: string;
  registration: string;
  amount: number;
  method: 'cash' | 'gcash' | 'maya' | 'card';
  reason: string;
  refund_no: string;
  refunded_by: string;
  /** The client's on-screen signature (protected file; open it with a file token). Set once. */
  signature?: string;
  signed_at?: string;
  /** Staff member who was there when the client signed. */
  signed_witness?: string;
  created: string;
}
