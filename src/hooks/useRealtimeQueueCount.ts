import { useWorkflowData } from './useWorkflowData';

export function useRealtimeQueueCount(): number {
  return useWorkflowData<{ count: number }>('/queue-count').data?.count ?? 0;
}
