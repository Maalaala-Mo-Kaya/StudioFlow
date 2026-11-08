import type { RegistrationErrors } from '../registrationValidation';
import { validationProps } from '../registrationValidation';

export function RegistrationFieldError({ field, errors }: {
  field: keyof RegistrationErrors;
  errors: RegistrationErrors;
}) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={validationProps(field, message)['aria-describedby']} className="mt-1.5 text-xs font-semibold text-red-700">
      {message}
    </p>
  );
}
