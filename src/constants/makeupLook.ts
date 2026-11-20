/**
 * Preferred makeup look, chosen at the kiosk when the order includes makeup / grooming.
 * Keep the values in sync with pb_hooks/studio_makeup_look.js.
 */
export const MAKEUP_LOOKS = [
  { value: 'full', label: 'Full makeup', hint: 'Complete makeup for photos: base, eyes, brows and lips.' },
  { value: 'light', label: 'Light / natural makeup', hint: 'A soft, natural finish with minimal makeup.' },
  { value: 'grooming', label: 'Grooming only', hint: 'Hair, brows and skin prep. No makeup.' },
] as const;

export type MakeupLook = typeof MAKEUP_LOOKS[number]['value'];

export const MAKEUP_LOOK_NOTE_MAX = 200;

export function makeupLookLabel(value: string | undefined | null): string {
  return MAKEUP_LOOKS.find((look) => look.value === value)?.label ?? '';
}
