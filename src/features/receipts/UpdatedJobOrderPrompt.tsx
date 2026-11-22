import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { pb } from '../../db/pocketbase';
import type { Registration } from '../../types';
import { Modal } from '../../components/common/Modal';
import { PrintReceiptModal } from '../cashier/components/PrintReceiptModal';
import { useToast } from '../../context/ToastContext';

/**
 * After something was added to a job order that already has a number (and so a printed claim stub),
 * offers to print the updated job order, which lists every item on the order. The next payment
 * receipt also says what was added.
 */
export const UpdatedJobOrderPrompt: React.FC<{
  registrationId: string;
  /** What was added, for the message ("Extra 8R Frame"). */
  added: string[];
  cashierName: string;
  onClose: () => void;
  /** Cashier: collect the new balance now (the receipt then says what was added). */
  onCollect?: () => void;
  /** The balance to collect, for the button. */
  balance?: number;
}> = ({ registrationId, added, cashierName, onClose, onCollect, balance }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<Registration | null>(null);

  const openPrint = async () => {
    setLoading(true);
    try {
      setPrinting(await pb.collection('registrations').getOne<Registration>(registrationId, {
        expand: 'organization,level,course,package,session_type', requestKey: null,
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The job order could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  if (printing) return <PrintReceiptModal registration={printing} cashierName={cashierName} onClose={onClose} />;
  return (
    <Modal title="Print the updated job order?" icon={Printer} size="md" busy={loading} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} disabled={loading}
          className="btn-tactile min-h-[42px] px-4 border border-neutral-400 text-ink text-xs font-black uppercase cursor-pointer disabled:opacity-50">
          Not now
        </button>
        {onCollect && (balance ?? 0) > 0 && (
          <button type="button" onClick={onCollect} disabled={loading}
            className="btn-tactile min-h-[42px] px-4 inline-flex items-center gap-2 bg-obsidian text-gold border border-line text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
            Collect ₱{(balance ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} now
          </button>
        )}
        <button type="button" onClick={() => void openPrint()} disabled={loading}
          className="btn-tactile min-h-[42px] px-5 inline-flex items-center gap-2 bg-gold text-on-gold text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
          <Printer className="w-4 h-4" /> {loading ? 'Loading…' : 'Print job order'}
        </button>
      </>}>
      <div className="space-y-2 font-sans text-xs text-ink">
        {added.length > 0 && <p><b>Added:</b> {added.join(', ')}.</p>}
        <p>
          The client&apos;s claim stub still lists the old items. Print the updated job order so they have the full list;
          the receipt for their next payment will also say what was added.
        </p>
      </div>
    </Modal>
  );
};
