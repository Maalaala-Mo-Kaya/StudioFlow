import type { Registration } from '../types';
import { DEFAULT_PHOTOS_PATH } from '../constants/studio';

/**
 * Sanitizes a path component, stripping dangerous traversal patterns and Windows/POSIX illegal characters.
 */
export function sanitizePathSegment(segment: string): string {
  if (!segment) return 'UNNAMED';
  return segment
    .trim()
    .replace(/\.\./g, '') // prevent directory traversal
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // strip illegal characters
    .replace(/\s+/g, '_') // normalize whitespace
    .replace(/^_+|_+$/g, ''); // strip leading/trailing underscores
}

/**
 * Generates a deterministic, auditable studio pictorial folder path.
 * Format: C:\StudioFlow_Photos\<ORG_CODE>\<COURSE_CODE>\<JOB_ORDER>_<FAMILY_NAME>_<GIVEN_NAME>
 */
export function getDeterministicFolderPath(
  reg: Registration,
  baseDrive: string = DEFAULT_PHOTOS_PATH
): string {
  const orgCode = sanitizePathSegment(
    reg.expand?.organization?.code || reg.expand?.organization?.name || 'ORGANIZATION'
  );
  const courseCode = sanitizePathSegment(
    reg.expand?.course?.code || reg.expand?.course?.name || 'COURSE'
  );
  const joNo = sanitizePathSegment(reg.job_order_no || `JO-${reg.id}`);
  const familyName = sanitizePathSegment(reg.family_name || 'STUDENT');
  const givenName = sanitizePathSegment(reg.given_name || '');

  const folderName = `${joNo}_${familyName}_${givenName}`.replace(/_+$/, '');

  return `${baseDrive}\\${orgCode}\\${courseCode}\\${folderName}`;
}

/**
 * Copies folder path to clipboard.
 */
export async function copyFolderPathToClipboard(path: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(path);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
