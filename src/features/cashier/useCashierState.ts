import { useState, useEffect, useMemo, useCallback } from 'react';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PaymentRecord, Registration } from '../../types';

export type CollectionMode = 'full' | 'initial' | 'additional';
const toCentavos = (amount: number) => Math.round(amount * 100);
const fromCentavos = (amount: number) => amount / 100;

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
  const [paymentType, setPaymentType] = useState<CollectionMode>('full');
  const [amountPaid, setAmountPaid] = useState('');
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

  const openPaymentModal = useCallback(async (reg: Registration) => {
    try {
      const [latest, payments] = await Promise.all([
        pb.collection('registrations').getOne<Registration>(reg.id, {
          expand: 'organization,level,course,package', requestKey: null,
        }),
        pb.collection('payments').getFullList<PaymentRecord>({
          filter: pb.filter('registration = {:registration}', { registration: reg.id }), requestKey: null,
        }),
      ]);
      const paidCentavos = payments.reduce((sum, payment) => sum + toCentavos(payment.amount), 0);
      const totalCentavos = toCentavos(latest.total_amount || 0);
      const balanceCentavos = Math.max(0, totalCentavos - paidCentavos);
      const hydrated = {
        ...latest,
        paid_amount: fromCentavos(paidCentavos),
        balance: fromCentavos(balanceCentavos),
      };
      const mode: CollectionMode = payments.length === 0 && latest.payment_type === 'downpayment' ? 'initial' : 'full';
      const paymentCentavos = mode === 'initial'
        ? Math.min(balanceCentavos, Math.round(totalCentavos / 200) * 100)
        : balanceCentavos;
      setSelectedReg(hydrated);
      setPaymentType(mode);
      setAmountPaid(String(fromCentavos(paymentCentavos)));
      setRemarks('');
    } catch (err) {
      console.error('Failed to load current payment balance:', err);
      toast.error('Could not load the latest payment balance. Please try again.');
    }
  }, [toast]);

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

    if (isProcessing) return;
    const amount = Number(amountPaid);
    const amountCentavos = toCentavos(amount);
    const balanceCentavos = toCentavos(selectedReg.balance);
    const validMoney = /^\d+$/.test(amountPaid) && Number.isFinite(amount) && Number.isInteger(amount);
    if (!validMoney || amountCentavos < 100 || amountCentavos > balanceCentavos) {
      toast.error('Please enter a valid payment amount.');
      return;
    }
    setIsProcessing(true);
    try {
      const receiptNo = `REC-${crypto.randomUUID()}`;
      await pb.collection('payments').create({
        registration: selectedReg.id,
        amount: fromCentavos(amountCentavos),
        payment_type: paymentType,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        cashier_id: user?.id || '',
        cash_tendered: paymentMethod === 'cash' ? fromCentavos(amountCentavos) : 0,
        change_amount: 0,
        receipt_no: receiptNo,
        remarks: remarks.trim(),
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
