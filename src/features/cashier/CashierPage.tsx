import React, { useState } from 'react';
import type { Registration } from '../../types';
import { CashierAddOnModal } from './components/CashierAddOnModal';
import { UpdatedJobOrderPrompt } from '../receipts/UpdatedJobOrderPrompt';
import { useToast } from '../../context/ToastContext';
import { refreshClientDocuments } from '../receipts/clientDocuments';
import { useCashierState } from './useCashierState';
import { CashierHeader } from './components/CashierHeader';
import { CashierFilterBar } from './components/CashierFilterBar';
import { CashierTable } from './components/CashierTable';
import { PaymentModal } from './components/PaymentModal';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { ReleaseDeliverableModal } from './components/ReleaseDeliverableModal';
import { NotifyPickupModal } from './components/NotifyPickupModal';
import { DeleteRegistrationModal } from './components/DeleteRegistrationModal';
import { CashierRegistrationEditor } from './components/CashierRegistrationEditor';
import { useStudioSettings } from '../../hooks/useStudioSettings';

export const CashierPage: React.FC = () => {
  const cashier = useCashierState();
  const { deleteReg } = cashier;
  const { pickupMessage } = useStudioSettings();
  const { toast } = useToast();
  const [editId, setEditId] = useState('');
  // Add-ons the client asks for at the counter, then: print the updated job order or collect now.
  const [addOnReg, setAddOnReg] = useState<Registration | null>(null);
  const [afterAdd, setAfterAdd] = useState<{ reg: Registration; added: string[] } | null>(null);

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Header Banner */}
      <CashierHeader
        totalCollectedToday={cashier.totalCollectedToday}
        paymentsToday={cashier.paymentsToday}
        refundsToday={cashier.refundsToday}
        refundedToday={cashier.refundedToday}
        lastPaymentAt={cashier.lastPaymentAt}
        onRefresh={cashier.fetchRegistrations}
      />

      {/* Filter Tabs & Search Bar */}
      <CashierFilterBar
        activeTab={cashier.activeTab}
        onSelectTab={cashier.setActiveTab}
        pendingCount={cashier.pendingCount}
        paidCount={cashier.paidCount}
        balanceCount={cashier.balanceCount}
        readyCount={cashier.readyCount}
        registrations={cashier.registrations}
        clientGroup={cashier.clientGroup}
        onClientGroupChange={cashier.setClientGroup}
        searchQuery={cashier.searchQuery}
        onSearchChange={cashier.setSearchQuery}
        filters={cashier.filters}
        filterOptions={cashier.filterOptions}
        onToggleFilter={cashier.toggleFilter}
        onClearFilters={cashier.clearFilters}
        visibleColumns={cashier.visibleColumns}
        onToggleColumn={cashier.toggleColumn}
        onResetColumns={cashier.resetColumns}
      />

      <CashierTable
        registrations={cashier.filteredRegistrations}
        visibleColumns={cashier.visibleColumns}
        loading={cashier.loading}
        filtered={Boolean(cashier.searchQuery.trim()) || cashier.registrations.length > 0}
        onOpenPayment={cashier.openPaymentModal}
        onOpenEdit={cashier.activeTab === 'pending' ? (reg) => setEditId(reg.id) : undefined}
        editableIds={cashier.editableIds}
        onOpenDelete={cashier.activeTab === 'pending' ? cashier.openDeleteModal : undefined}
        deletableIds={cashier.deletableIds}
        onOpenPrint={(reg) => cashier.openPrintModal(reg)}
        onOpenRelease={cashier.openReleaseModal}
        onOpenAddOn={setAddOnReg}
        pickupMode={cashier.activeTab === 'ready'}
        onOpenNotify={cashier.openNotifyModal}
      />

      {editId && (
        <CashierRegistrationEditor key={editId} id={editId} onClose={() => setEditId('')}
          onSaved={(saved) => {
            cashier.applyRegistrationEdit(saved);
            setEditId('');
            toast.success('Client registration updated successfully.');
          }} />
      )}

      {deleteReg && (
        <DeleteRegistrationModal
          registration={deleteReg}
          onClose={cashier.closeDeleteModal}
          onDelete={(reason) => cashier.deleteRegistration(deleteReg, reason)}
        />
      )}

      {addOnReg && (
        <CashierAddOnModal registration={addOnReg} onClose={() => setAddOnReg(null)}
          onSaved={(saved, added) => {
            setAddOnReg(null);
            toast.success(`Added ${added.join(', ')}. New balance ₱${saved.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`);
            if (saved.framing_status === 'in_production' && addOnReg.framing_status !== 'in_production') {
              toast.warning(`JO ${saved.job_order_no} is back in production for the new item. Don't release it until an admin marks it ready.`);
            }
            if (saved.job_order_no) refreshClientDocuments(saved.id, toast.warning);
            void cashier.fetchRegistrations(true);
            if (saved.job_order_no) setAfterAdd({ reg: saved, added });
            else if (saved.balance > 0) void cashier.openPaymentModal(saved);
          }} />
      )}
      {afterAdd && (
        <UpdatedJobOrderPrompt registrationId={afterAdd.reg.id} added={afterAdd.added} cashierName={cashier.cashierName}
          balance={afterAdd.reg.balance}
          onCollect={() => { const reg = afterAdd.reg; setAfterAdd(null); void cashier.openPaymentModal(reg); }}
          onClose={() => setAfterAdd(null)} />
      )}

      {/* PAYMENT COLLECTION MODAL */}
      {cashier.selectedReg && (
        <PaymentModal
          registration={cashier.selectedReg}
          onClose={cashier.closePaymentModal}
          onSubmit={cashier.handleConfirmPayment}
          isProcessing={cashier.isProcessing}
          paymentType={cashier.paymentType}
          onPaymentTypeChange={cashier.setPaymentType}
          amountPaid={cashier.amountPaid}
          onAmountPaidChange={cashier.setAmountPaid}
          paymentMethod={cashier.paymentMethod}
          onPaymentMethodChange={cashier.setPaymentMethod}
          cashierName={cashier.cashierName}
          onCashierNameChange={cashier.setCashierName}
          remarks={cashier.remarks}
          onRemarksChange={cashier.setRemarks}
          cashReceived={cashier.cashReceived}
          onCashReceivedChange={cashier.setCashReceived}
        />
      )}

      {/* PRINT RECEIPT MODAL */}
      {cashier.printReg && (
        <PrintReceiptModal
          registration={cashier.printReg}
          paymentId={cashier.printPaymentId}
          cashierName={cashier.cashierName}
          onClose={cashier.closePrintModal}
        />
      )}

      {/* RELEASE DELIVERABLE GATE MODAL (T048 / AC022) */}
      {cashier.releaseReg && (
        <ReleaseDeliverableModal
          registration={cashier.releaseReg}
          onClose={cashier.closeReleaseModal}
          onConfirmRelease={cashier.handleReleaseDeliverable}
          onOpenPaymentModal={cashier.openPaymentModal}
        />
      )}

      {/* PICKUP NOTICE (text message to the client) */}
      {cashier.notifyReg && (
        <NotifyPickupModal
          registration={cashier.notifyReg}
          template={pickupMessage}
          onClose={cashier.closeNotifyModal}
          onMarkNotified={cashier.markNotified}
        />
      )}
    </div>
  );
};
