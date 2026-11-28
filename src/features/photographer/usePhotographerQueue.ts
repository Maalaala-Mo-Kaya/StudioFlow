import { useState, useEffect, useCallback, useRef } from 'react';
import { pb } from '../../db/pocketbase';
import type { RecordSubscription } from 'pocketbase';
import { mountSubscription, useRealtimeClient } from '../../hooks/useRealtimeClient';
import type { Registration } from '../../types';
import { playStudioChime } from '../../utils/audio';
import { useToast } from '../../context/ToastContext';
import { workflowError } from '../../hooks/useWorkflowData';
import { useAuth } from '../../context/AuthContext';
import { activePhotographyTasks } from './photographyTasks';

export function usePhotographerQueue() {
  const { toast } = useToast();
  const user = useAuth().user;
  const photographerId = user?.id;
  const admin = user?.role === 'admin';
  const [queue, setQueue] = useState<Registration[]>([]);
  const [recentlyDone, setRecentlyDone] = useState<Registration[]>([]);
  const [photographyRecords, setPhotographyRecords] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const queueRequest = useRef(0);

  const fetchLiveQueue = useCallback(async () => {
    const request = ++queueRequest.current;
    setLoading(true);
    setLoadError('');
    try {
      const [queueRes, doneRes] = await Promise.all([
        pb.collection('registrations').getFullList<Registration>({
          filter: "(status = 'shooting' || status = 'paid') && queue_number > 0 && (paid_amount > 0 || (payment_status = 'fully_paid' && total_amount = 0)) && (makeup_state = 'completed' || (makeup_service = '' && makeup_state = ''))",
          sort: 'queue_issued_at,queue_number,id',
          expand: 'organization,level,course,package,session_type',
          requestKey: null,
        }),
        pb.collection('registrations').getList<Registration>(1, 20, {
          filter: "status = 'done_shooting' || status = 'completed'",
          sort: '-updated',
          expand: 'organization,level,course,package,session_type',
          requestKey: null,
        }),
      ]);

      if (request !== queueRequest.current) return;
      setPhotographyRecords([...queueRes, ...doneRes.items]);
      setQueue(queueRes.filter((reg) => {
        const tasks = activePhotographyTasks(reg);
        return admin || !tasks.length || tasks.some((task) => task.status !== 'completed' && (!task.photographerId || task.photographerId === photographerId));
      }));
      const mine = (reg: Registration) => activePhotographyTasks(reg)
        .some((task) => task.status === 'completed' && task.photographerId === photographerId);
      setRecentlyDone([...queueRes.filter(mine), ...doneRes.items]);
      setLoadError('');
      setReady(true);
    } catch (err) {
      if (request !== queueRequest.current) return;
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) {
        return;
      }
      console.error('Failed to load photography records:', err);
      setLoadError('Could not load the latest photography records.');
    } finally {
      if (request === queueRequest.current) setLoading(false);
    }
  }, [admin, photographerId]);

  const live = useRealtimeClient();
  useEffect(() => {
    void fetchLiveQueue();
    const stop = mountSubscription<RecordSubscription<Registration>>(
      (listener) => live.collection('registrations').subscribe('*', listener),
      (event) => {
        if (event.action === 'create' || event.action === 'update') playStudioChime();
        void fetchLiveQueue();
      },
    );
    return () => { queueRequest.current += 1; stop(); };
  }, [live, fetchLiveQueue]);

  const startPhotography = useCallback(
    async (reg: Registration) => {
      try {
        await pb.collection('registrations').update(reg.id, {
          status: 'shooting',
        });
        playStudioChime();
        return true;
      } catch (err) {
        toast.error(workflowError(err));
        return false;
      } finally {
        void fetchLiveQueue();
      }
    },
    [fetchLiveQueue, toast]
  );

  const handleMarkDone = useCallback(
    async (reg: Registration) => {
      try {
        await pb.collection('registrations').update(reg.id, {
          status: 'done_shooting',
          photo_status: 'shot_raw',
        });
        return true;
      } catch (err) {
        toast.error(workflowError(err));
        return false;
      } finally {
        void fetchLiveQueue();
      }
    },
    [fetchLiveQueue, toast]
  );

  return {
    queue,
    photographyRecords,
    recentlyDone,
    loading: loading && !ready,
    refreshing: loading && ready,
    loadError,
    activeTab,
    setActiveTab,
    fetchLiveQueue,
    startPhotography,
    handleMarkDone,
  };
}
