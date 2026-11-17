import { pb } from '../db/pocketbase';
import { workflowApi } from '../hooks/useWorkflowData';

export async function getPhotoFolderPath(registrationId: string) {
  const { path } = await pb.send<{ path: string }>(`${workflowApi}/photo-folder/${registrationId}`, { method: 'POST' });
  return path;
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
