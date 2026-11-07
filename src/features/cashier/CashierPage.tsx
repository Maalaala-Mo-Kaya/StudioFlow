import React from 'react';
import { useCashierState } from './useCashierState';
import { CashierHeader } from './components/CashierHeader';
import { CashierFilterBar } from './components/CashierFilterBar';
import { CashierTable } from './components/CashierTable';
import { PaymentModal } from './components/PaymentModal';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { ReleaseDeliverableModal } from './components/ReleaseDeliverableModal';

export const CashierPage: React.FC = () => {
  const cashier = useCashierState();

  return (
    <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
      {/* Header Banner */}
      <CashierHeader
        totalCollectedToday={cashier.totalCollectedToday}
        onRefresh={cashier.fetchRegistrations}
      />

      {/* Filter Tabs & Search Bar */}
      <CashierFilterBar
        activeTab={cashier.activeTab}
        onSelectTab={cashier.setActiveTab}
        pendingCount={cashier.pendingCount}
        paidCount={cashier.paidCount}
        balanceCount={cashier.balanceCount}
        searchQuery={cashier.searchQuery}
        onSearchChange={cashier.setSearchQuery}
      />

      <CashierTable
        registrations={cashier.filteredRegistrations}
        loading={cashier.loading}
        filtered={Boolean(cashier.searchQuery.trim()) || cashier.registrations.length > 0}
        onOpenPayment={cashier.openPaymentModal}
        onOpenPrint={(reg) => cashier.openPrintModal(reg, 'customer')}
        onOpenRelease={cashier.openReleaseModal}
      />

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
        />
      )}

      {/* PRINT RECEIPT MODAL */}
      {cashier.printReg && (
        <PrintReceiptModal
          registration={cashier.printReg}
          copyType={cashier.printCopyType}
          onCopyTypeChange={cashier.setPrintCopyType}
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
    </div>
  );
};
