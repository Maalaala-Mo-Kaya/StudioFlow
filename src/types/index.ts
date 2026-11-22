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

/** One choice in a package's option group; `for` limits it to clients of that gender. */
export interface PackageOptionChoice {
  id: string;
  label: string;
  for: 'all' | Gender;
  /** What this choice comes with ("1 pc - 3R", "2 pcs - wallet size"); options never change the price. */
  items?: string[];
  /** Set only on the "keep" choice of a group that exchanges an inclusion. */
  keep?: boolean;
}

/** A named list the client chooses from ("Attire — choose 1"). Options never change the price. */
export interface PackageOptionGroup {
  id: string;
  name: string;
  /** How many choices the client picks (fewer if fewer are offered for their gender). */
  pick: number;
  /** The inclusion this group can exchange ("Colored toga w/out cap"); keeping it is then a choice too. */
  replaces?: string;
  /** Who may keep the exchanged inclusion; the others must pick one of the choices. */
  replaces_for?: 'all' | Gender;
  /** A free extra the client picks a version of ("Free 7x9 classic frame": Family / Barkada / Couple). */
  freebie?: boolean;
  choices: PackageOptionChoice[];
}

/** The client's picks in one option group, saved on the job order with their labels. */
export interface ChosenPackageOptions {
  group_id: string;
  group: string;
  /** The inclusion the pick exchanges, when the group exchanges one. */
  replaces?: string;
  choices: { id: string; label: string; items?: string[]; keep?: boolean }[];
}

/** ① A single item: a print size (counted as hard copies), a frame, or anything else. */
export type CatalogItemCategory = 'print' | 'frame' | 'other' | 'attire' | 'background';
/** What the admin sends when saving a single item. */
export interface CatalogItemInput {
  name?: string;
  category?: CatalogItemCategory;
  amount?: number;
  is_active?: boolean;
  client_kind?: ClientKind | 'both';
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogItemCategory;
  /** Price of one piece when sold on its own. */
  amount?: number;
  /** Sold on its own at the kiosk (as an add-on the server keeps in step). */
  is_active?: boolean;
  /** Which kiosk form sells it on its own; empty means both. */
  client_kind?: ClientKind | 'both' | '';
}

/** A single item and how many: one row of a pose. */
export interface PoseRow {
  item: string;
  qty: number;
}

/** ② A saved pose (item_packages): a template copied into packages ("Colored toga w/out cap" = 11R × 1, Wallet × 2). */
export interface ItemPackage {
  id: string;
  name: string;
  items: PoseRow[];
  is_active?: boolean;
}

/**
 * A pose inside a package: an attire (Toga w/out cap) on a background (Colored, B&W) with its own
 * prints, or a typed title. Two poses may be the same attire and background with other quantities.
 */
export interface PackagePose {
  type: 'pose';
  id: string;
  /** Made from the attire and background when set; typed otherwise. */
  title: string;
  attire?: string;
  background?: string;
  items: PoseRow[];
}

/** What a client may take instead of the exchanged pose, with its own contents. */
export interface ExchangeOption {
  id: string;
  title: string;
  attire?: string;
  background?: string;
  for: 'all' | Gender;
  items: PoseRow[];
}

/** In a package: the "Filipiniana" pose can be exchanged (girls keep it, boys swap). */
export interface PackageExchange {
  id: string;
  name: string;
  /** The id of a pose in this package's inclusions. */
  pose: string;
  keep_for: 'all' | Gender;
  options: ExchangeOption[];
}

export type PackageInclusionRef = PackagePose | { type: 'item'; id: string; qty: number };

/** A freebie with choices: the client picks one at the kiosk. */
/**
 * A choice in an option (`PackagePick`): normally an attire (on a background) with its own prints, like
 * a pose ("Glamour shots": 1 pc - 3R, 2 pcs - wallet). Older choices may be a single item or typed text.
 */
export interface PickChoice {
  id: string;
  /** Attire choice: its title (made from the attire and background), attire, background and prints. */
  title?: string;
  attire?: string;
  background?: string;
  items?: PoseRow[];
  item?: string;
  qty?: number;
  label?: string;
  for: 'all' | 'female' | 'male';
}

/** "Backdrop — choose 2": the client picks `pick` of the choices at the kiosk. */
export interface PackagePick {
  id: string;
  name: string;
  pick: number;
  choices: PickChoice[];
}

export interface FreebieChoice {
  id: string;
  /** The freebie's single item id (one of the package's freebies). */
  item: string;
  choices: { id: string; label: string }[];
}

/** ③ What a package is built from; the server renders inclusions, freebies and options from it. */
export interface PackageStructure {
  frame_item: string;
  unlimited_shots: boolean;
  inclusions: PackageInclusionRef[];
  freebies: string[];
  exchanges: PackageExchange[];
  /** Freebies the client picks a version of ("Free 7x9 classic frame": Family / Barkada / Couple). */
  freebie_choices: FreebieChoice[];
  /** Options: the client chooses `pick` of a list (part of the package; nothing exchanged, no price change). */
  picks: PackagePick[];
  /** Older choice groups (not exchanges), kept as they were. */
  choice_groups: PackageOptionGroup[];
}

/** A titled group of inclusions ("Frame and Prints"), which can hold items and sub-sections. */
export interface InclusionSection {
  title: string;
  items: PackageInclusion[];
}

/** One inclusion: a plain item, or a titled section. */
export type PackageInclusion = string | InclusionSection;

export interface Package {
  revenue_category?: RevenueCategory | '';
  id: string;
  code: string;
  name: string;
  amount: number;
  description?: string;
  /** The kiosk line under the price ("with 10x12 PREMIUM frame"); empty shows "with <frame>". */
  tagline?: string;
  /** Flyer and sample photo file names, in order (the first is the cover). */
  photos?: string[];
  collectionId?: string;
  collectionName?: string;
  /** Plain items and titled sections (two levels); old records may hold JSON text. */
  inclusions?: PackageInclusion[] | string;
  /** Free items given with the package (free frame, raw copies…), listed apart from inclusions. */
  freebies?: string[] | string;
  /** Groups of options the client chooses from at registration. */
  option_groups?: PackageOptionGroup[] | null;
  /** What the package is built from (the builder); the fields above are rendered from it. */
  structure?: PackageStructure | null;
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
  /** Set when this add-on is a single item sold at the kiosk; managed from that item. */
  catalog_item?: string;
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

/** One edit of a job order's items: add-ons added / removed, package or other fees changed (pesos). */
export interface OrderChange {
  at: string;
  by: string;
  added: { name: string; amount: number }[];
  removed: { name: string; amount: number }[];
  package?: { from: string; to: string; amount: number };
  fees?: { from: number; to: number };
  total_before: number;
  total_after: number;
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
    inclusions?: PackageInclusion[]; freebies?: string[]; photo_selection_limit?: number;
  } | null;
  add_ons?: RegistrationAddOn[];
  /** The client's picks from the package's option groups (checked by the server). */
  package_options?: ChosenPackageOptions[] | null;
  other_fees?: number;
  revenue_terms?: RevenueSplit | null;
  revenue_review?: { mua: number; reason: string; by: string; at: string } | null;
  /** Discount credit (centavos). `fixed`: given as a peso amount, not a percentage. */
  revenue_discount?: { studio: number; mua: number; percentage?: number; fixed?: boolean; reason: string; by: string; byId?: string; at: string } | null;
  /** Server-written history of items added / removed after the order was made (registration_billing.pb.js). */
  order_changes?: OrderChange[] | null;
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
  discount_snapshot?: { studio: number; mua: number; percentage: number; fixed?: boolean; reason: string } | null;
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
