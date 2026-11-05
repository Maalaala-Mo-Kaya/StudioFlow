import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Registration } from '../../../types';
import { PAYMENT_METHOD_OPTIONS } from '../../../constants/studio';
import { formatClientName, formatCurrency, formatJobOrderNo, formatQueueNumber } from '../../../utils/formatters';

interface PaymentModalProps {
  registration: Registration;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isProcessing: boolean;
  paymentType: 'full' | 'initial' | 'balance_settlement';
  onPaymentTypeChange: (type: 'full' | 'initial' | 'balance_settlement') => void;
  amountPaid: number;
  onAmountPaidChange: (amount: number) => void;
  paymentMethod: 'cash' | 'gcash' | 'maya' | 'card';
  onPaymentMethodChange: (method: 'cash' | 'gcash' | 'maya' | 'card') => void;
  cashierName: string;
  onCashierNameChange: (name: string) => void;
  remarks: string;
  onRemarksChange: (remarks: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  registration: selectedReg,
  onClose,
  onSubmit,
  isProcessing,
  paymentType,
  onPaymentTypeChange,
  amountPaid,
  onAmountPaidChange,
  paymentMethod,
  onPaymentMethodChange,
  cashierName,
  onCashierNameChange,
  remarks,
  onRemarksChange,
}) => {
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-[#0A0A0A]/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="animate-modal bg-white max-w-lg sm:max-w-xl lg:max-w-2xl w-full p-6 sm:p-8 border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#C9A227] max-h-[92dvh] overflow-y-auto transition-all">
        <div className="flex justify-between items-start pb-4 border-b-2 border-[#0A0A0A] mb-5">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#9A7816]">
              POS // PAYMENT VERIFICATION
            </span>
            <h3 className="text-xl font-black text-[#0A0A0A] uppercase mt-0.5">
              {formatClientName(selectedReg)}
            </h3>
            <p className="text-xs text-neutral-500 font-mono font-bold mt-0.5">
              Job Order <span className="text-red-600">{formatJobOrderNo(selectedReg.job_order_no)}</span> •
              Queue {formatQueueNumber(selectedReg.queue_number)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-[#0A0A0A] text-[#C9A227] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {/* Breakdown Box */}
          <div className="bg-[#0A0A0A] text-white p-4 border border-[#0A0A0A] text-xs space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Package:</span>
              <span className="font-bold text-[#C9A227]">
                {selectedReg.expand?.package?.name || 'Pictorial Package'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Total Job Amount:</span>
              <span className="font-black text-white">
                {formatCurrency(selectedReg.total_amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Previously Paid:</span>
              <span className="font-bold text-emerald-400">
                {formatCurrency(selectedReg.paid_amount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-800 pt-2">
              <span className="text-[#C9A227] uppercase font-black">Amount Due:</span>
              <span className="font-black text-[#C9A227] text-base">
                {formatCurrency(selectedReg.balance)}
              </span>
            </div>
          </div>

          {/* Payment Mode Toggle */}
          <div>
            <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
              Collection Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onPaymentTypeChange('full');
                  onAmountPaidChange(selectedReg.balance);
                }}
                className={`btn-tactile min-h-[42px] py-2 px-3 text-xs font-black uppercase tracking-wider border-2 cursor-pointer ${
                  paymentType === 'full'
                    ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
                }`}
              >
                Full Settlement
              </button>

              <button
                type="button"
                onClick={() => {
                  onPaymentTypeChange('initial');
                  onAmountPaidChange(Math.round(selectedReg.total_amount / 2));
                }}
                className={`btn-tactile min-h-[42px] py-2 px-3 text-xs font-black uppercase tracking-wider border-2 cursor-pointer ${
                  paymentType === 'initial'
                    ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A]'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-[#0A0A0A]'
                }`}
              >
                50% Downpayment
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
              Cash / Amount Tendered (₱)
            </label>
            <input
              type="number"
              min="1"
              max={selectedReg.balance}
              value={amountPaid}
              onChange={(e) => onAmountPaidChange(Number(e.target.value))}
              className="w-full min-h-[48px] font-mono text-xl font-black px-4 py-2 border-2 border-[#0A0A0A] bg-[#F7F2E0] text-[#0A0A0A]"
            />
            <span className="font-mono text-[11px] font-bold text-neutral-600 mt-1 block">
              Remaining Balance After Payment:{' '}
              <strong className="text-red-600">
                {formatCurrency(Math.max(0, selectedReg.balance - amountPaid))}
              </strong>
            </span>
          </div>

          {/* Payment Method & Cashier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => onPaymentMethodChange(e.target.value as 'cash' | 'gcash' | 'maya' | 'card')}
                className="w-full min-h-[44px] text-xs font-bold px-3 py-2 border border-neutral-400 bg-white"
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
                Prepared By (Cashier)
              </label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => onCashierNameChange(e.target.value)}
                className="w-full min-h-[44px] text-xs font-bold px-3 py-2 border border-neutral-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
              Reference / Remarks
            </label>
            <input
              type="text"
              placeholder="Optional GCash ref # or cashier note"
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              className="w-full min-h-[44px] text-xs px-3 py-2 border border-neutral-400"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-4 border-t border-neutral-200 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-tactile w-1/3 min-h-[46px] py-2.5 border border-[#0A0A0A] text-[#0A0A0A] font-bold text-xs uppercase hover:bg-neutral-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="btn-tactile w-2/3 min-h-[46px] py-2.5 bg-[#0A0A0A] text-[#C9A227] border border-[#0A0A0A] font-black text-xs uppercase tracking-widest cursor-pointer"
            >
              {isProcessing ? 'Processing...' : 'Confirm & Print Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
