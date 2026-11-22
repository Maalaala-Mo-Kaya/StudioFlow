import { pb } from '../../db/pocketbase';
import { workflowApi } from '../../hooks/useWorkflowData';

/** Camera hot-folder station as reported by /api/studioflow/camera. */
export interface CameraStatus {
  id: string;
  name: string;
  watchFolder: string;
  enabled: boolean;
  includeSubfolders: boolean;
  importRaw: boolean;
  /** False when the watch folder is missing or offline on the server. */
  folderOk: boolean;
  client: null | {
    id: string;
    jobOrder: string;
    name: string;
    school: string;
    queueNumber: number | null;
    /** Photos currently in the client's folder (null if it can't be read). */
    photoCount: number | null;
  };
  taskId: string;
  photographerId: string;
  finishing: boolean;
  sessionStarted: string;
  sessionImported: number;
  /** Files in the folder that are not being sent to the linked client. */
  waiting: number;
  lastScan: string;
  lastImport: string;
  lastError: string;
}

/** Editable configuration (collection `camera_stations`). */
export interface CameraConfig {
  name: string;
  watch_folder: string;
  enabled: boolean;
  include_subfolders: boolean;
  import_raw: boolean;
}

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: { name: string; path: string }[];
}

type CameraAction = 'scan' | 'start' | 'end' | 'claim-waiting';

export function cameraAction(id: string, action: CameraAction, registration?: string) {
  return pb.send<CameraStatus>(`${workflowApi}/camera/${id}/${action}`, {
    method: 'POST',
    body: registration ? { registration } : {},
    requestKey: null,
  });
}

export function browseFolders(path: string) {
  return pb.send<FolderListing>(`${workflowApi}/camera/browse`, { query: { path }, requestKey: null });
}

export function createFolder(path: string, name: string) {
  return pb.send<FolderListing>(`${workflowApi}/camera/browse`, { method: 'POST', body: { path, name }, requestKey: null });
}

/** Seconds/minutes since a PocketBase date string, for "last checked" labels. */
export function sinceLabel(value: string) {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value.replace(' ', 'T'))) / 1000));
  if (!Number.isFinite(seconds)) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}
