import { useState, useEffect } from 'react';
import { pb } from '../db/pocketbase';

/**
 * Subscribes to PocketBase `registrations` collection and returns the live count
 * of clients currently waiting in the photo queue (`paid` or `shooting`).
 */
export function useRealtimeQueueCount(): number {
  const [queueCount, setQueueCount] = useState<number>(0);

  useEffect(() => {
    const updateCount = async () => {
      try {
        const records = await pb.collection('registrations').getList(1, 1, {
          filter: "status = 'paid' || status = 'shooting'",
          requestKey: null,
        });
        setQueueCount(records.totalItems);
      } catch {
        // Ignore transient network errors when PocketBase is starting up
      }
    };

    updateCount();
    pb.collection('registrations').subscribe('*', () => {
      updateCount();
    });

    return () => {
      pb.collection('registrations').unsubscribe('*');
    };
  }, []);

  return queueCount;
}
