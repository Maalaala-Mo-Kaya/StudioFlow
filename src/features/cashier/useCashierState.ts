import { useState, useEffect, useMemo, useCallback } from 'react';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Registration } from '../../types';

export type CashierTab = 'pending' | 'paid' | 'balances';

export function useCashierState() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CashierTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Payment Processing Modal State
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [paymentType, setPaymentType] = useState<'full' | 'initial' | 'balance_settlement'>('full');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya' | 'card'>('cash');
  const [cashierName, setCashierName] = useState(user?.name || 'Mel (Cashier)');
  const [remarks, setRemarks] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Print Modal State
  const [printReg, setPrintReg] = useState<Registration | null>(null);
  const [printCopyType, setPrintCopyType] = useState<'customer' | 'owner'>('customer');

  // Release Modal State
  const [releaseReg, setReleaseReg] = useState<Registration | null>(null);

  const fetchRegistrations = useCallback(async () => {
    try {
      setLoading(true);
      const records = await pb.collection('registrations').getFullList<Registration>({
        sort: '-created',
        expand: 'organization,level,course,package',
        requestKey: null,
      });
      setRegistrations(records);
    } catch (err) {
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) return;
      console.error('Failed to fetch registrations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistrations();

    pb.collection('registrations').subscribe('*', () => {
      fetchRegistrations();
    });

    return () => {
      pb.collection('registrations').unsubscribe('*');
    };
  }, [fetchRegistrations]);

  const openPaymentModal = useCallback((reg: Registration) => {
    setSelectedReg(reg);
    if (reg.status === 'pending_payment') {
      setPaymentType(reg.payment_type === 'downpayment' ? 'initial' : 'full');
      setAmountPaid(
        reg.payment_type === 'downpayment' ? Math.round(reg.total_amount / 2) : reg.total_amount
      );
    } else {
      setPaymentType('balance_settlement');
      setAmountPaid(reg.balance);
    }
  }, []);

  const closePaymentModal = useCallback(() => {
    setSelectedReg(null);
  }, []);

  const openPrintModal = useCallback((reg: Registration, copyType: 'customer' | 'owner' = 'customer') => {
    setPrintReg(reg);
    setPrintCopyType(copyType);
  }, []);

  const closePrintModal = useCallback(() => {
    setPrintReg(null);
  }, []);

  const openReleaseModal = useCallback((reg: Registration) => {
    setReleaseReg(reg);
  }, []);

  const closeReleaseModal = useCallback(() => {
    setReleaseReg(null);
  }, []);

  const handleReleaseDeliverable = async (id: string, claimedBy: string) => {
    try {
      await pb.collection('registrations').update(id, {
        status: 'released',
        framing_status: 'released',
        claimed_by: claimedBy,
        released_at: new Date().toISOString(),
      });
      toast.success(`Deliverable package released to ${claimedBy}`);
      fetchRegistrations();
    } catch (err) {
      console.error('Failed to release deliverable:', err);
      toast.error('Failed to release package: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReg) return;

    if (amountPaid <= 0) {
      toast.error('Please enter a valid payment amount.');
      return;
    }

    setIsProcessing(true);
    try {
      await pb.collection('payments').create({
        registration: selectedReg.id,
        amount: Number(amountPaid),
        payment_type: paymentType,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        receipt_no: `REC-${Date.now().toString().slice(-6)}`,
        remarks: remarks.trim(),
      }, { requestKey: null });

      const currentPaid = selectedReg.paid_amount || 0;
      const newPaid = currentPaid + Number(amountPaid);
      const newBalance = Math.max(0, (selectedReg.total_amount || 0) - newPaid);
      const newStatus = selectedReg.status === 'pending_payment' ? 'paid' : selectedReg.status;
      const newPaymentStatus = newBalance <= 0 ? 'fully_paid' : 'downpayment';

      // Explicitly update registration in PocketBase to guarantee immediate consistency
      await pb.collection('registrations').update(selectedReg.id, {
        paid_amount: newPaid,
        balance: newBalance,
        status: newStatus,
        payment_status: newPaymentStatus,
      }, { requestKey: null });

      const updated = await pb.collection('registrations').getOne<Registration>(selectedReg.id, {
        expand: 'organization,level,course,package',
        requestKey: null,
      });

      // Instant 0ms optimistic UI update for Cashier Table
      setRegistrations((prev) =>
        prev.map((r) => (r.id === selectedReg.id ? updated : r))
      );

      toast.success('Payment recorded successfully.');
      setSelectedReg(null);
      setPrintReg(updated);
      setPrintCopyType('customer');

      // Trigger background sync
      fetchRegistrations();
    } catch (err: unknown) {
      console.error('Failed to process payment:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Payment processing failed: ' + msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const pendingCount = useMemo(
    () => registrations.filter((r) => r.status === 'pending_payment').length,
    [registrations]
  );

  const paidCount = useMemo(
    () =>
      registrations.filter(
        (r) => r.status !== 'pending_payment' && r.status !== 'cancelled'
      ).length,
    [registrations]
  );

  const balanceCount = useMemo(
    () => registrations.filter((r) => r.balance > 0).length,
    [registrations]
  );

  const totalCollectedToday = useMemo(
    () => registrations.reduce((s, r) => s + (r.paid_amount || 0), 0),
    [registrations]
  );

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return registrations.filter((r) => {
      const fullName = `${r.given_name} ${r.family_name}`.toLowerCase();
      const jobNo = (r.job_order_no || '').toLowerCase();
      const school = (r.expand?.organization?.name || '').toLowerCase();
      const matchesSearch = !q || fullName.includes(q) || jobNo.includes(q) || school.includes(q);

      if (!matchesSearch) return false;

      if (activeTab === 'pending') {
        return r.status === 'pending_payment';
      }
      if (activeTab === 'paid') {
        return r.status !== 'pending_payment' && r.status !== 'cancelled';
      }
      if (activeTab === 'balances') {
        return r.balance > 0;
      }
      return true;
    });
  }, [registrations, searchQuery, activeTab]);

  return {
    registrations,
    filteredRegistrations,
    loading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    pendingCount,
    paidCount,
    balanceCount,
    totalCollectedToday,
    fetchRegistrations,
    // Payment Modal
    selectedReg,
    openPaymentModal,
    closePaymentModal,
    paymentType,
    setPaymentType,
    amountPaid,
    setAmountPaid,
    paymentMethod,
    setPaymentMethod,
    cashierName,
    setCashierName,
    remarks,
    setRemarks,
    isProcessing,
    handleConfirmPayment,
    // Print Modal
    printReg,
    printCopyType,
    setPrintCopyType,
    openPrintModal,
    closePrintModal,
    // Release Modal
    releaseReg,
    openReleaseModal,
    closeReleaseModal,
    handleReleaseDeliverable,
  };
}
