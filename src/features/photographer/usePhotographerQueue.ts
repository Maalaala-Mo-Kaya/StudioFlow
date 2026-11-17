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
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [currentlyShootingId, setCurrentlyShootingId] = useState<string | null>(null);

  const fetchLiveQueue = useCallback(async () => {
    try {
      setLoading(true);
      const [queueRes, doneRes] = await Promise.all([
        pb.collection('registrations').getFullList<Registration>({
          filter: "status = 'shooting' || (status = 'paid' && paid_amount > 0 && (makeup_state = 'completed' || (makeup_service = '' && makeup_state = '')))",
          sort: 'created,queue_number,id',
          expand: 'organization,level,course,package',
          requestKey: null,
        }),
        pb.collection('registrations').getList<Registration>(1, 20, {
          filter: "status = 'done_shooting' || status = 'completed'",
          sort: '-updated',
          expand: 'organization,level,course,package',
          requestKey: null,
        }),
      ]);

      setQueue(queueRes);
      setRecentlyDone(doneRes.items);

      const shooting = queueRes.find((r) => r.status === 'shooting');
      setCurrentlyShootingId(shooting?.id ?? null);
    } catch (err) {
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) {
        return;
      }
      console.error('Failed to load photographer queue:', err);
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
      } catch (err) {
        toast.error(workflowError(err));
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
      } catch (err) {
        toast.error(workflowError(err));
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
    activeTab,
    setActiveTab,
    currentlyShootingId,
    fetchLiveQueue,
    handleCallStudent,
    handleMarkDone,
  };
}
