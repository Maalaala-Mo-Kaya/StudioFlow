import { pb } from '../../db/pocketbase';
import { workflowApi } from '../../hooks/useWorkflowData';
import type { PhotographyTask, Registration } from '../../types';
import { isPhotographed } from '../../utils/releaseReadiness';

export const activePhotographyTasks = (reg: Registration) =>
  reg.photography?.tasks.filter((task) => !task.removedAt) ?? [];

export function photographyStatus(reg: Registration) {
  if (isPhotographed(reg)) return 'Photography Officially Done';
  const tasks = activePhotographyTasks(reg);
  if (tasks.some((task) => task.status === 'completed')) return 'Partially Completed';
  return reg.status === 'shooting' ? 'In Progress' : 'Waiting';
}

export function taskStatus(task: PhotographyTask) {
  if (task.removedAt) return task.status === 'completed' ? 'Completed · item removed' : 'Item removed';
  if (task.finishingAt) return 'Syncing photos';
  if (task.status === 'completed') return 'Completed';
  return task.status === 'in_progress' ? 'In Progress' : 'Waiting';
}

export function photographyAction(registration: string, action: 'start' | 'done' | 'reassign',
  body: { taskId: string; cameraId?: string; photographerId?: string }) {
  return pb.send<{ started?: boolean; completed?: boolean; official?: boolean; syncing?: boolean }>(
    `${workflowApi}/photography/${registration}/${action}`, { method: 'POST', body, requestKey: null },
  );
}
