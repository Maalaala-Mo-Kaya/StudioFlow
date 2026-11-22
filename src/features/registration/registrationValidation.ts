export const registrationFields = [
  'client_kind', 'family_name', 'given_name', 'gender', 'organization', 'level', 'course',
  'session_type', 'event_date', 'event_venue', 'email',
  'mobile_number', 'package', 'package_options', 'makeup_look', 'makeup_look_note', 'terms_accepted', 'signature',
] as const;

type RegistrationField = typeof registrationFields[number];
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export const genderOptions = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

export const packageRequiredMessage = 'Please select a Job Order Package to continue.';

// Keep the contact formats in sync with pb_hooks/registration_validation.pb.js.
export const emailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
export const mobilePattern = /^(?:0|\+?63)9\d{9}$/;

export function validationProps(field: RegistrationField, error?: string) {
  const id = `registration-${field}`;
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}
