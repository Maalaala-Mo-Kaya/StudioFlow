export type StaffRole = 'admin' | 'cashier' | 'photographer';

export interface StaffUser {
  id: string;
  username: string;
  email?: string;
  name: string;
  role: StaffRole;
  verified?: boolean;
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
  levelId: string;
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

export interface Package {
  id: string;
  code: string;
  name: string;
  amount: number;
  description?: string;
  inclusions?: string[] | string;
  is_active?: boolean;
}

export interface AddOn {
  id: string;
  code?: string;
  name: string;
  amount: number;
  is_active?: boolean;
}

export interface RegistrationAddOn {
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
  job_order_no: string;
  queue_number: number;
  family_name: string;
  given_name: string;
  middle_name?: string;
  student_id?: string;
  organization?: string;
  level?: string;
  course?: string;
  department?: string;
  section?: string;
  mobile_number: string;
  email?: string;
  package: string;
  add_ons?: RegistrationAddOn[];
  other_fees?: number;
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
  photo_status?: PhotoStatus;
  claimed_by?: string;
  released_at?: string;
  created: string;
  updated: string;
  // expanded relations
  expand?: {
    organization?: Organization;
    level?: Level;
    course?: Course;
    package?: Package;
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
  remarks?: string;
  created: string;
}
