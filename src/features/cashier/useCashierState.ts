import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PaymentRecord, Registration } from '../../types';

export type CollectionMode = 'full' | 'initial' | 'additional';
const toCentavos = (amount: number) => Math.round(amount * 100);
const fromCentavos = (amount: number) => amount / 100;

export function canUseCollectionMode(reg: Registration, mode: CollectionMode) {
  return toCentavos(reg.balance) > 0 && (mode === 'additional' || toCentavos(reg.paid_amount) <= 0);
}

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
  const submittingPayment = useRef(false);
  const receiptNo = useRef<string | null>(null);

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
    if (submittingPayment.current) return;
    try {
      const [latest, payments] = await Promise.all([
        pb.collection('registrations').getOne<Registration>(reg.id, {
          expand: 'organization,level,course,package', requestKey: null, cache: 'no-store',
        }),
        pb.collection('payments').getFullList<PaymentRecord>({
          filter: pb.filter('registration = {:registration}', { registration: reg.id }),
          requestKey: null, cache: 'no-store',
        }),
      ]);
      const paidCentavos = payments.reduce((sum, payment) =>
        (payment.status || 'completed') === 'completed' ? sum + toCentavos(payment.amount) : sum, 0);
      const totalCentavos = toCentavos(latest.total_amount || 0);
      const balanceCentavos = Math.max(0, totalCentavos - paidCentavos);
      const hydrated = {
        ...latest,
        paid_amount: fromCentavos(paidCentavos),
        balance: fromCentavos(balanceCentavos),
      };
      const mode: CollectionMode = !canUseCollectionMode(hydrated, 'full')
        ? 'additional' : latest.payment_type === 'downpayment' ? 'initial' : 'full';
      const paymentCentavos = mode === 'initial'
        ? Math.min(balanceCentavos, Math.round(totalCentavos / 200) * 100)
        : balanceCentavos;
      if (submittingPayment.current) return;
      receiptNo.current = null;
      setSelectedReg(hydrated);
      setPaymentType(mode);
      setAmountPaid(mode === 'additional' ? '' : String(fromCentavos(paymentCentavos)));
      setRemarks('');
    } catch (err) {
      console.error('Failed to load current payment balance:', err);
      toast.error('Could not load the latest payment balance. Please try again.');
    }
  }, [toast]);

  const closePaymentModal = useCallback(() => {
    if (!submittingPayment.current) setSelectedReg(null);
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
    if (!selectedReg || submittingPayment.current) return;
    if (!canUseCollectionMode(selectedReg, paymentType)) {
      toast.error('This collection mode is unavailable for the current job order.');
      return;
    }
    const amount = Number(amountPaid);
    const amountCentavos = toCentavos(amount);
    const balanceCentavos = toCentavos(selectedReg.balance);
    const validMoney = /^\d+$/.test(amountPaid) && Number.isFinite(amount) && Number.isInteger(amount);
    if (!validMoney || amountCentavos < 100 || amountCentavos > balanceCentavos) {
      toast.error('Please enter a valid payment amount.');
      return;
    }
    submittingPayment.current = true;
    setIsProcessing(true);
    try {
      const receipt = receiptNo.current ??= `REC-${crypto.randomUUID()}`;
      const payments = pb.collection('payments');
      await payments.create({
        registration: selectedReg.id,
        amount: fromCentavos(amountCentavos),
        payment_type: paymentType,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        cashier_id: user?.id || '',
        cash_tendered: paymentMethod === 'cash' ? fromCentavos(amountCentavos) : 0,
        change_amount: 0,
        receipt_no: receipt,
        remarks: remarks.trim(),
      }, { requestKey: null }).catch(async (err: unknown) => {
        // The server may have saved the payment before the response was lost.
        await payments.getFirstListItem(pb.filter('registration = {:registration} && receipt_no = {:receipt}', {
          registration: selectedReg.id, receipt,
        }), { requestKey: null, cache: 'no-store' }).catch(() => { throw err; });
      });

      setSelectedReg(null);
      toast.success('Payment recorded successfully.');
      const updated = await pb.collection('registrations').getOne<Registration>(selectedReg.id, {
        expand: 'organization,level,course,package',
        requestKey: null,
        cache: 'no-store',
      }).catch((err: unknown) => {
        console.error('Failed to load the job order for the receipt:', err);
        toast.error('Payment was recorded. Refresh the job order to print the receipt.');
        fetchRegistrations();
        return null;
      });
      if (!updated) return;

      // Instant 0ms optimistic UI update for Cashier Table
      setRegistrations((prev) =>
        prev.map((r) => (r.id === selectedReg.id ? updated : r))
      );

      setPrintReg(updated);
      setPrintCopyType('customer');

      // Trigger background sync
      fetchRegistrations();
    } catch (err: unknown) {
      console.error('Failed to process payment:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Payment processing failed: ' + msg);
    } finally {
      submittingPayment.current = false;
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
