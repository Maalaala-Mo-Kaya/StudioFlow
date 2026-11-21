import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { PaymentRecord, RefundRecord, Registration } from '../../types';
import { studioDayStartUtc } from '../../utils/studioDay';
import { randomId } from '../../utils/randomId';
import { refreshClientDocuments } from '../receipts/clientDocuments';
import { clientSummary } from '../../utils/clientInfo';
import { isReadyForRelease } from '../../utils/releaseReadiness';
import { ALL_CLIENTS, matchesClientGroup } from '../../utils/clientGroup';
import {
  cashierFilterOptions, defaultCashierColumns, emptyCashierFilters, matchesCashierFilters,
  type CashierColumnId, type CashierFilterKey, type CashierFilters,
} from './cashierFilters';

export type CollectionMode = 'full' | 'initial' | 'additional';
const toCentavos = (amount: number) => Math.round(amount * 100);
const fromCentavos = (amount: number) => amount / 100;

export function canUseCollectionMode(reg: Registration, mode: CollectionMode) {
  // Full / Downpayment are only for the first payment: anything received before (even if later refunded) means Additional.
  const received = toCentavos(reg.paid_amount) + toCentavos(reg.refunded_amount ?? 0);
  return toCentavos(reg.balance) > 0 && (mode === 'additional' || received <= 0);
}

export type CashierTab = 'pending' | 'paid' | 'balances' | 'ready';

const CASHIER_COLUMNS_KEY = 'studioflow.cashier.visibleColumns';
function readCashierColumns(): CashierColumnId[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CASHIER_COLUMNS_KEY) ?? 'null');
    const valid = Array.isArray(saved) ? defaultCashierColumns.filter((id) => saved.includes(id)) : [];
    if (valid.length) return valid;
  } catch {
    // Storage unavailable: use the default columns.
  }
  return defaultCashierColumns;
}

/** Orders waiting at the counter: ready for release and not yet claimed. */
export const isWaitingForPickup = (reg: Registration) => reg.status !== 'released' && isReadyForRelease(reg);

export function useCashierState() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [deletableIds, setDeletableIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteReg, setDeleteReg] = useState<Registration | null>(null);
  const fetchGeneration = useRef(0);
  const [collectedTodayCentavos, setCollectedTodayCentavos] = useState(0);
  const [paymentsToday, setPaymentsToday] = useState(0);
  const [refundsToday, setRefundsToday] = useState(0);
  const [refundedTodayCentavos, setRefundedTodayCentavos] = useState(0);
  const [lastPaymentAt, setLastPaymentAt] = useState('');
  // The studio day (Manila midnight) the total belongs to; when it changes, the total reloads.
  const [studioDay, setStudioDay] = useState(studioDayStartUtc);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CashierTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  // School / walk-in picker next to the search box.
  const [clientGroup, setClientGroup] = useState(ALL_CLIENTS);
  // Advanced Filters panel (funnel button) and the columns shown, kept per device.
  const [filters, setFilters] = useState<CashierFilters>(emptyCashierFilters);
  const [visibleColumns, setVisibleColumns] = useState<CashierColumnId[]>(readCashierColumns);
  useEffect(() => {
    try { localStorage.setItem(CASHIER_COLUMNS_KEY, JSON.stringify(visibleColumns)); } catch { /* optional */ }
  }, [visibleColumns]);
  const toggleFilter = (key: CashierFilterKey, id: string) => setFilters((current) => ({
    ...current,
    [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id],
  }));
  const toggleColumn = (id: CashierColumnId) => setVisibleColumns((current) => {
    if (!current.includes(id)) return [...current, id];
    return current.length > 1 ? current.filter((item) => item !== id) : current;
  });

  // Payment Processing Modal State
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [paymentType, setPaymentType] = useState<CollectionMode>('full');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya' | 'card'>('cash');
  const [cashierName, setCashierName] = useState(user?.name || 'Mel (Cashier)');
  const [remarks, setRemarks] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const submittingPayment = useRef(false);
  // Sent with the payment so a retried request can find the payment the server already saved.
  const clientKey = useRef<string | null>(null);

  // Print Modal State
  const [printReg, setPrintReg] = useState<Registration | null>(null);
  const [printPaymentId, setPrintPaymentId] = useState<string | undefined>();

  // Release Modal State
  const [releaseReg, setReleaseReg] = useState<Registration | null>(null);

  const fetchRegistrations = useCallback(async (background = false) => {
    const generation = ++fetchGeneration.current;
    try {
      if (!background) setLoading(true);
      const [records, todaysPayments, todaysRefunds, lastPayment, eligibleIds] = await Promise.all([
        pb.collection('registrations').getFullList<Registration>({
          sort: '-created',
          expand: 'organization,level,course,package,session_type',
          requestKey: null,
        }),
        // Only payments received today (studio time) that were not voided or refunded.
        pb.collection('payments').getFullList<PaymentRecord>({
          filter: pb.filter("created >= {:start} && (status = 'completed' || status = '')", { start: studioDayStartUtc() }),
          fields: 'amount',
          requestKey: null,
        }),
        // Refunds given today come off today's total. (Older servers have no refunds: treat as none.)
        pb.collection('refunds').getFullList<RefundRecord>({
          filter: pb.filter('created >= {:start}', { start: studioDayStartUtc() }),
          fields: 'amount',
          requestKey: null,
        }).catch(() => [] as RefundRecord[]),
        // The most recent counted payment, shown under the total (e.g. when today is still ₱0).
        pb.collection('payments').getList<PaymentRecord>(1, 1, {
          filter: "status = 'completed' || status = ''",
          sort: '-created',
          fields: 'created',
          requestKey: null,
        }),
        pb.send<string[]>('/api/studioflow/deletable-registrations', { requestKey: null, cache: 'no-store' }).catch(() => []),
      ]);
      if (generation !== fetchGeneration.current) return;
      setRegistrations(records);
      setDeletableIds(new Set(Array.isArray(eligibleIds) ? eligibleIds : []));
      const refundedToday = todaysRefunds.reduce((sum, refund) => sum + toCentavos(refund.amount), 0);
      setCollectedTodayCentavos(todaysPayments.reduce((sum, payment) => sum + toCentavos(payment.amount), 0) - refundedToday);
      setRefundedTodayCentavos(refundedToday);
      setRefundsToday(todaysRefunds.length);
      setPaymentsToday(todaysPayments.length);
      setLastPaymentAt(lastPayment.items[0]?.created ?? '');
    } catch (err) {
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) return;
      console.error('Failed to fetch registrations:', err);
    } finally {
      if (generation === fetchGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRegistrations();

    pb.collection('registrations').subscribe('*', () => {
      fetchRegistrations();
    });
    const refreshDeleted = () => void fetchRegistrations(true);
    void pb.realtime.subscribe('studioflow-registration-deleted', refreshDeleted).catch(console.error);

    return () => {
      pb.collection('registrations').unsubscribe('*');
      void pb.realtime.unsubscribeByTopicAndListener('studioflow-registration-deleted', refreshDeleted).catch(console.error);
    };
  }, [fetchRegistrations]);

  const deleteRegistration = async (reg: Registration, reason: string) => {
    try {
      await pb.send(`/api/studioflow/registrations/${reg.id}/delete`, { method: 'POST', body: { reason }, requestKey: null });
      setRegistrations((current) => current.filter((item) => item.id !== reg.id));
      setDeleteReg(null);
      toast.success('Registration deleted.');
    } catch (error) {
      if (error instanceof ClientResponseError) {
        if (error.status === 409 || error.status === 404) {
          setDeleteReg(null);
          toast.error(error.response.message || 'This registration is no longer available.');
          return;
        }
        if (error.status === 401 || error.status === 403) return 'Your account does not have permission to delete this registration.';
        if (error.status === 400) return error.response.message || 'Check the deletion reason and try again.';
        if (error.status >= 500) return 'The server could not delete the registration. Try again.';
      }
      return 'Deletion could not be confirmed. Check your connection and try again.';
    } finally {
      void fetchRegistrations(true);
    }
  };

  // At Manila midnight "Collected Today" starts over on its own, even if the screen was left open.
  // A sleeping PC can miss the timer, so the day is also checked when the window gets focus.
  useEffect(() => {
    const rollOver = () => {
      const today = studioDayStartUtc();
      if (today !== studioDay) {
        setStudioDay(today);
        void fetchRegistrations();
      }
    };
    const nextMidnight = Date.parse(studioDay.replace(' ', 'T')) + 86_400_000;
    const timer = setTimeout(rollOver, Math.max(1_000, nextMidnight - Date.now() + 1_000));
    window.addEventListener('focus', rollOver);
    document.addEventListener('visibilitychange', rollOver);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', rollOver);
      document.removeEventListener('visibilitychange', rollOver);
    };
  }, [studioDay, fetchRegistrations]);

  const openPaymentModal = useCallback(async (reg: Registration) => {
    if (submittingPayment.current) return;
    try {
      const [latest, payments, refunds] = await Promise.all([
        pb.collection('registrations').getOne<Registration>(reg.id, {
          expand: 'organization,level,course,package,session_type', requestKey: null, cache: 'no-store',
        }),
        pb.collection('payments').getFullList<PaymentRecord>({
          filter: pb.filter('registration = {:registration}', { registration: reg.id }),
          requestKey: null, cache: 'no-store',
        }),
        pb.collection('refunds').getFullList<RefundRecord>({
          filter: pb.filter('registration = {:registration}', { registration: reg.id }),
          requestKey: null, cache: 'no-store',
        }).catch(() => [] as RefundRecord[]),
      ]);
      const refundedCentavos = refunds.reduce((sum, refund) => sum + toCentavos(refund.amount), 0);
      // Net paid: counted payments minus money given back.
      const paidCentavos = payments.reduce((sum, payment) =>
        (payment.status || 'completed') === 'completed' ? sum + toCentavos(payment.amount) : sum, 0) - refundedCentavos;
      const totalCentavos = toCentavos(latest.total_amount || 0);
      const balanceCentavos = Math.max(0, totalCentavos - paidCentavos);
      const hydrated = {
        ...latest,
        paid_amount: fromCentavos(paidCentavos),
        refunded_amount: fromCentavos(refundedCentavos),
        balance: fromCentavos(balanceCentavos),
      };
      const mode: CollectionMode = !canUseCollectionMode(hydrated, 'full')
        ? 'additional' : latest.payment_type === 'downpayment' ? 'initial' : 'full';
      const paymentCentavos = mode === 'initial'
        ? Math.min(balanceCentavos, Math.round(totalCentavos / 200) * 100)
        : balanceCentavos;
      if (submittingPayment.current) return;
      clientKey.current = null;
      setSelectedReg(hydrated);
      setPaymentType(mode);
      setAmountPaid(mode === 'additional' ? '' : String(fromCentavos(paymentCentavos)));
      setRemarks('');
      setCashReceived('');
    } catch (err) {
      console.error('Failed to load current payment balance:', err);
      toast.error('Could not load the latest payment balance. Please try again.');
    }
  }, [toast]);

  const closePaymentModal = useCallback(() => {
    if (!submittingPayment.current) setSelectedReg(null);
  }, []);

  const openPrintModal = useCallback((reg: Registration, paymentId?: string) => {
    setPrintReg(reg);
    setPrintPaymentId(paymentId);
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
    const discountSettlement = paymentType !== 'initial' && !!selectedReg.revenue_discount && amountCentavos === balanceCentavos && balanceCentavos % 100 !== 0;
    const moneyPattern = discountSettlement ? /^\d+(\.\d{1,2})?$/ : /^\d+$/;
    if (!moneyPattern.test(amountPaid) || !Number.isFinite(amount)
      || amountCentavos < (discountSettlement ? 1 : 100) || amountCentavos > balanceCentavos) {
      toast.error('Please enter a valid payment amount.');
      return;
    }
    const cash = Number(cashReceived);
    if (paymentMethod === 'cash' && (!moneyPattern.test(cashReceived) || toCentavos(cash) < amountCentavos)) {
      toast.error('Enter the cash received. It must cover the payment amount.');
      return;
    }
    submittingPayment.current = true;
    setIsProcessing(true);
    try {
      const key = clientKey.current ??= randomId();
      const payments = pb.collection('payments');
      const saved = await payments.create<PaymentRecord>({
        registration: selectedReg.id,
        amount: fromCentavos(amountCentavos),
        payment_type: paymentType,
        payment_method: paymentMethod,
        cashier_name: cashierName,
        cashier_id: user?.id || '',
        cash_tendered: paymentMethod === 'cash' ? fromCentavos(toCentavos(cash)) : 0,
        client_key: key,
        remarks: remarks.trim(),
      }, { requestKey: null }).catch(async (err: unknown) => {
        // The server may have saved the payment before the response was lost.
        return payments.getFirstListItem<PaymentRecord>(pb.filter('registration = {:registration} && client_key = {:key}', {
          registration: selectedReg.id, key,
        }), { requestKey: null, cache: 'no-store' }).catch(() => { throw err; });
      });

      setSelectedReg(null);
      refreshClientDocuments(selectedReg.id, toast.warning);
      toast.success(saved.change_amount
        ? `Payment recorded. Change: ₱${saved.change_amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
        : 'Payment recorded successfully.');
      const updated = await pb.collection('registrations').getOne<Registration>(selectedReg.id, {
        expand: 'organization,level,course,package,session_type',
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
      setPrintPaymentId(saved.id);

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

  // Orders matching the school picker and the Advanced Filters; the tabs and their counts use this.
  const inGroup = useMemo(
    () => registrations.filter((r) => matchesClientGroup(r, clientGroup) && matchesCashierFilters(r, filters)),
    [registrations, clientGroup, filters]
  );
  const filterOptions = useMemo(() => cashierFilterOptions(registrations), [registrations]);

  const pendingCount = useMemo(
    () => inGroup.filter((r) => r.status === 'pending_payment').length,
    [inGroup]
  );

  const paidCount = useMemo(
    () => inGroup.filter((r) => r.status !== 'pending_payment' && r.status !== 'cancelled').length,
    [inGroup]
  );

  const balanceCount = useMemo(
    // Cancelled orders owe nothing, so they are not in Balances.
    () => inGroup.filter((r) => r.balance > 0 && r.status !== 'cancelled').length,
    [inGroup]
  );

  const readyCount = useMemo(() => inGroup.filter(isWaitingForPickup).length, [inGroup]);

  // Pickup notice: the modal shows the text message; "Mark as notified" records it on the server.
  const [notifyReg, setNotifyReg] = useState<Registration | null>(null);
  const markNotified = async (reg: Registration) => {
    try {
      await pb.send(`/api/studioflow/pickup-notified/${reg.id}`, { method: 'POST' });
      toast.success(`JO ${reg.job_order_no} marked as notified.`);
      setNotifyReg(null);
      fetchRegistrations();
    } catch (err) {
      toast.error('Could not record the notice: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const totalCollectedToday = fromCentavos(collectedTodayCentavos);

  const filteredRegistrations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return inGroup.filter((r) => {
      const fullName = `${r.given_name} ${r.family_name}`.toLowerCase();
      const jobNo = (r.job_order_no || '').toLowerCase();
      const school = clientSummary(r, true).toLowerCase();
      const matchesSearch = !q || fullName.includes(q) || jobNo.includes(q) || school.includes(q)
        || r.id.toLowerCase().includes(q) || r.student_id?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeTab === 'pending') {
        return r.status === 'pending_payment';
      }
      if (activeTab === 'paid') {
        return r.status !== 'pending_payment' && r.status !== 'cancelled';
      }
      if (activeTab === 'balances') {
        return r.balance > 0 && r.status !== 'cancelled';
      }
      if (activeTab === 'ready') {
        return isWaitingForPickup(r);
      }
      return true;
    });
  }, [inGroup, searchQuery, activeTab]);

  return {
    registrations,
    deletableIds,
    deleteReg,
    openDeleteModal: setDeleteReg,
    closeDeleteModal: () => setDeleteReg(null),
    deleteRegistration,
    filteredRegistrations,
    loading,
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    clientGroup,
    setClientGroup,
    filters,
    filterOptions,
    toggleFilter,
    clearFilters: () => setFilters(emptyCashierFilters),
    visibleColumns,
    toggleColumn,
    resetColumns: () => setVisibleColumns(defaultCashierColumns),
    pendingCount,
    paidCount,
    balanceCount,
    readyCount,
    notifyReg,
    openNotifyModal: setNotifyReg,
    closeNotifyModal: () => setNotifyReg(null),
    markNotified,
    totalCollectedToday,
    paymentsToday,
    refundsToday,
    refundedToday: fromCentavos(refundedTodayCentavos),
    lastPaymentAt,
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
    cashReceived,
    setCashReceived,
    isProcessing,
    handleConfirmPayment,
    // Print Modal
    printReg,
    printPaymentId,
    openPrintModal,
    closePrintModal,
    // Release Modal
    releaseReg,
    openReleaseModal,
    closeReleaseModal,
    handleReleaseDeliverable,
  };
}
