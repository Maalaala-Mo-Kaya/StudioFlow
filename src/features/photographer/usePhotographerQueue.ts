import { useState, useEffect, useCallback } from 'react';
import { pb } from '../../db/pocketbase';
import type { Registration } from '../../types';
import { playStudioChime } from '../../utils/audio';
import { useToast } from '../../context/ToastContext';
import { workflowError } from '../../hooks/useWorkflowData';

export function usePhotographerQueue() {
  const { toast } = useToast();
  const [queue, setQueue] = useState<Registration[]>([]);
  const [recentlyDone, setRecentlyDone] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [currentlyShootingId, setCurrentlyShootingId] = useState<string | null>(null);

  const fetchLiveQueue = useCallback(async () => {
    try {
      setLoading(true);
      const [queueRes, doneRes] = await Promise.all([
        pb.collection('registrations').getFullList<Registration>({
          filter: "status = 'shooting' || (status = 'paid' && queue_number > 0 && (paid_amount > 0 || (payment_status = 'fully_paid' && total_amount = 0)) && (makeup_state = 'completed' || (makeup_service = '' && makeup_state = '')))",
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

      setQueue(queueRes);
      setRecentlyDone(doneRes.items);
      setLoadError('');

      const shooting = queueRes.find((r) => r.status === 'shooting');
      setCurrentlyShootingId(shooting?.id ?? null);
    } catch (err) {
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) {
        return;
      }
      setLoadError(workflowError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveQueue();

    const subscription = pb.collection('registrations').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') {
        playStudioChime();
      }
      fetchLiveQueue();
    });

    return () => {
      void subscription.then((unsubscribe) => unsubscribe()).catch(console.error);
    };
  }, [fetchLiveQueue]);

  const handleCallStudent = useCallback(
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
        if (currentlyShootingId === reg.id) {
          setCurrentlyShootingId(null);
        }
        return true;
      } catch (err) {
        toast.error(workflowError(err));
        return false;
      } finally {
        void fetchLiveQueue();
      }
    },
    [currentlyShootingId, fetchLiveQueue, toast]
  );

  return {
    queue,
    recentlyDone,
    loading,
    loadError,
    activeTab,
    setActiveTab,
    currentlyShootingId,
    fetchLiveQueue,
    handleCallStudent,
    handleMarkDone,
  };
}
