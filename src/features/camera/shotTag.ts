/** Shot type labels in photo file names ("IMG_0001 [TOGA CAP].JPG"). No imports: used by tests too. */
// Mirrors pb_hooks/studio_shot_types.js: keep the two in step.
export const SHOT_CODE_PATTERN = /^[A-Z0-9](?:[A-Z0-9 -]{0,22}[A-Z0-9])?$/;
const tagPattern = / \[([A-Z0-9](?:[A-Z0-9 -]{0,22}[A-Z0-9])?)\](?=(?:_\d+)?$)/;

function split(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/** The type code in a photo's file name, or ''. */
export function tagOf(name: string) {
  return split(name)[0].match(tagPattern)?.[1] ?? '';
}

/** The file name without its type. */
export function untagged(name: string) {
  const [stem, ext] = split(name);
  return stem.replace(tagPattern, '') + ext;
}

/** The file name with `code` as its type ('' removes it). */
export function tagged(name: string, code: string) {
  const [stem, ext] = split(untagged(name));
  return code ? `${stem} [${code}]${ext}` : stem + ext;
}

/** A label from a shot type name: "Toga with cap" → "TOGA WITH CAP". */
export function codeFromName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9 -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24).replace(/[ -]+$/, '');
}
