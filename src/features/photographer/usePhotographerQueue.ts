import { useState, useEffect, useCallback } from 'react';
import { pb } from '../../db/pocketbase';
import type { Registration, PhotoStatus } from '../../types';
import { playStudioChime } from '../../utils/audio';

export function usePhotographerQueue() {
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
          filter: "status = 'paid' || status = 'shooting'",
          sort: 'queue_number',
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
      if (shooting) setCurrentlyShootingId(shooting.id);
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

    pb.collection('registrations').subscribe('*', (e) => {
      if (e.action === 'create' || e.action === 'update') {
        playStudioChime();
      }
      fetchLiveQueue();
    });

    return () => {
      pb.collection('registrations').unsubscribe('*');
    };
  }, [fetchLiveQueue]);

  const handleCallStudent = useCallback(
    async (reg: Registration) => {
      try {
        setCurrentlyShootingId(reg.id);
        playStudioChime();
        await pb.collection('registrations').update(reg.id, {
          status: 'shooting',
        });
        fetchLiveQueue();
      } catch (err) {
        console.error('Failed to call student:', err);
      }
    },
    [fetchLiveQueue]
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
        fetchLiveQueue();
      } catch (err) {
        console.error('Failed to mark shoot done:', err);
      }
    },
    [currentlyShootingId, fetchLiveQueue]
  );

  const handleUpdatePhotoStatus = useCallback(
    async (regId: string, photoStatus: PhotoStatus) => {
      try {
        await pb.collection('registrations').update(regId, {
          photo_status: photoStatus,
        });
        fetchLiveQueue();
      } catch (err) {
        console.error('Failed to update photo status:', err);
      }
    },
    [fetchLiveQueue]
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
    handleUpdatePhotoStatus,
  };
}
