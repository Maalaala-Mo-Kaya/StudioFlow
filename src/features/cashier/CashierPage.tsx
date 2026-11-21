import React from 'react';
import { useCashierState } from './useCashierState';
import { CashierHeader } from './components/CashierHeader';
import { CashierFilterBar } from './components/CashierFilterBar';
import { CashierTable } from './components/CashierTable';
import { PaymentModal } from './components/PaymentModal';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { ReleaseDeliverableModal } from './components/ReleaseDeliverableModal';
import { NotifyPickupModal } from './components/NotifyPickupModal';
import { DeleteRegistrationModal } from './components/DeleteRegistrationModal';
import { useStudioSettings } from '../../hooks/useStudioSettings';

export const CashierPage: React.FC = () => {
  const cashier = useCashierState();
  const { deleteReg } = cashier;
  const { pickupMessage } = useStudioSettings();

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
        onOpenDelete={cashier.activeTab === 'pending' ? cashier.openDeleteModal : undefined}
        deletableIds={cashier.deletableIds}
        onOpenPrint={(reg) => cashier.openPrintModal(reg)}
        onOpenRelease={cashier.openReleaseModal}
        pickupMode={cashier.activeTab === 'ready'}
        onOpenNotify={cashier.openNotifyModal}
      />

      {deleteReg && (
        <DeleteRegistrationModal
          registration={deleteReg}
          onClose={cashier.closeDeleteModal}
          onDelete={(reason) => cashier.deleteRegistration(deleteReg, reason)}
        />
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
