import React from 'react';
import type { Registration } from '../types';
import { pb } from '../db/pocketbase';
import { RECEIPT_TERMS_CLAUSES, STUDIO_INFO } from '../constants/studio';
import {
  formatCurrency,
  formatJobOrderNo,
  formatQueueNumber,
  formatShortDate,
} from '../utils/formatters';
import { getRegistrationAddOns } from '../utils/registrationAddOns';

interface YellowFormReceiptProps {
  registration: Registration;
  copyType?: 'customer' | 'owner';
  cashierName?: string;
}

export const YellowFormReceipt: React.FC<YellowFormReceiptProps> = ({
  registration,
  copyType = 'customer',
  cashierName = 'Cashier Staff',
}) => {
  const isCustomer = copyType === 'customer';
  const orgName = registration.expand?.organization?.name || 'School / Organization';
  const courseName = registration.expand?.course?.name || registration.course || 'N/A';
  const pkgCode = registration.expand?.package?.code || 'PKG-A';
  const pkgAmount = registration.expand?.package?.amount;
  const addOns = getRegistrationAddOns(registration.add_ons);
  const isFullPayment = registration.payment_status === 'fully_paid' || registration.balance === 0;

  const signatureUrl =
    registration.signatureDataUrl ||
    (registration.signature ? pb.files.getURL(registration, registration.signature) : null);

  return (
    <article
      aria-label={isCustomer ? 'Customer Job Order Receipt' : 'Studio Owner Copy Receipt'}
      className={`receipt-container w-full max-w-[820px] mx-auto p-4 sm:p-6 print:p-3 print:max-w-full print:shadow-none print:m-0 print:border-black border-2 border-[#0A0A0A] rounded-none text-[#0A0A0A] font-sans shadow-[6px_6px_0px_#0A0A0A] mb-6 print:mb-0 break-inside-avoid print:break-inside-avoid ${
        isCustomer ? 'bg-[#FDF8E4]' : 'bg-white'
      }`}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 print:gap-2 border-b-2 border-[#0A0A0A] pb-4 print:pb-1.5">
        <div>
          <h1 className="text-2xl sm:text-3xl print:text-xl font-black tracking-wider uppercase m-0 leading-none text-[#0A0A0A]">
            {STUDIO_INFO.name}
          </h1>
          <p className="text-xs print:text-[9px] italic font-serif text-neutral-800 mt-1 print:mt-0.5">{STUDIO_INFO.tagline}</p>
          <p className="text-[11px] print:text-[8px] text-neutral-700 mt-1 print:mt-0.5">{STUDIO_INFO.address}</p>
          <p className="text-[11px] print:text-[8px] font-semibold text-neutral-800">{STUDIO_INFO.hours}</p>
        </div>

        <div className="w-full sm:w-auto sm:text-right bg-white/80 sm:bg-transparent p-3 sm:p-0 print:p-0 border border-[#0A0A0A]/30 sm:border-0">
          <div className="inline-block bg-[#0A0A0A] text-[#C9A227] text-[10px] print:text-[8px] font-mono font-bold px-2.5 py-1 print:py-0.5 uppercase tracking-widest">
            {isCustomer ? 'Customer Claiming Stub // Yellow Form' : 'Studio Accounting Copy'}
          </div>
          <div className="text-xs print:text-[9px] font-mono font-bold text-neutral-700 mt-1.5 print:mt-0.5">
            DATE: {formatShortDate(registration.created)}
          </div>
          <div className="mt-1 print:mt-0.5">
            <span className="text-[10px] print:text-[8px] font-black text-neutral-900 uppercase tracking-wider block">
              DO NOT LOSE YOUR JOB ORDER RECEIPT
            </span>
            <span className="text-2xl print:text-lg font-mono font-black text-red-600 tracking-wider">
              {formatJobOrderNo(registration.job_order_no)}
            </span>
          </div>
          <div className="text-xs print:text-[9px] font-mono font-bold text-[#0A0A0A] bg-[#C9A227]/30 border border-[#0A0A0A] inline-block px-2 py-0.5 mt-1 print:mt-0.5">
            QUEUE {formatQueueNumber(registration.queue_number)}
          </div>
        </div>
      </div>

      {/* Section 1: Client Information */}
      <div className="mt-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest bg-[#0A0A0A] text-[#C9A227] px-2.5 py-1 inline-block mb-2">
          01 // Client Information
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Family Name
            </span>
            <span className="font-bold text-[#0A0A0A] text-sm uppercase">
              {registration.family_name}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Given Name
            </span>
            <span className="font-bold text-[#0A0A0A] text-sm uppercase">
              {registration.given_name}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Middle Name
            </span>
            <span className="font-bold text-[#0A0A0A] text-sm uppercase">
              {registration.middle_name || '—'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
          <div className="sm:col-span-2 border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              School - Campus / Organization
            </span>
            <span className="font-bold text-[#0A0A0A]">{orgName}</span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Department
            </span>
            <span className="font-bold text-[#0A0A0A]">
              {registration.department || registration.expand?.level?.name || 'College'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
          <div className="sm:col-span-2 border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Full Name of the Course
            </span>
            <span className="font-bold text-[#0A0A0A]">{courseName}</span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Section (If any)
            </span>
            <span className="font-bold text-[#0A0A0A]">{registration.section || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Section 2: Contact Details */}
      <div className="mt-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest bg-[#0A0A0A] text-[#C9A227] px-2.5 py-1 inline-block mb-2">
          02 // Contact Details
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Mobile Number
            </span>
            <span className="font-mono font-bold text-[#0A0A0A] text-sm">
              {registration.mobile_number}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Email Address
            </span>
            <span className="font-bold text-[#0A0A0A] break-all">
              {registration.email || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Section 3: Job Order & Payment */}
      <div className="mt-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest bg-[#0A0A0A] text-[#C9A227] px-2.5 py-1 inline-block mb-2">
          03 // Job Order/s &amp; Payment
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Package Code
            </span>
            <span className="font-mono font-black text-[#0A0A0A] text-sm">{pkgCode}</span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Package Amount
            </span>
            <span className="font-mono font-bold text-[#0A0A0A] text-sm">
              {pkgAmount === undefined ? '—' : formatCurrency(pkgAmount, { exact: true })}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Other Fees
            </span>
            <span className="font-mono font-bold text-[#0A0A0A] text-sm">
              {formatCurrency(registration.other_fees, { exact: true })}
            </span>
          </div>
        </div>

        {addOns.length > 0 && (
          <div className="mt-2 border border-[#0A0A0A] bg-white/90 p-2 text-xs">
            <h3 className="mb-1 text-[9px] font-mono font-bold uppercase text-neutral-500">Selected Add-ons</h3>
            <ul className="space-y-1">
              {addOns.map((item, index) => (
                <li key={item.id ?? index} className="flex justify-between gap-3">
                  <span>{item.name}</span>
                  <span className="shrink-0 font-mono font-bold">{formatCurrency(item.amount, { exact: true })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">Total Billed</span>
            <span className="font-mono font-black text-sm">{formatCurrency(registration.total_amount, { exact: true })}</span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Amount Paid
            </span>
            <span className="font-mono font-black text-emerald-700 text-sm">
              {formatCurrency(registration.paid_amount, { exact: true })}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90">
            <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
              Balance
            </span>
            <span className="font-mono font-black text-rose-600 text-sm">
              {formatCurrency(registration.balance, { exact: true })}
            </span>
          </div>
          <div className="border border-[#0A0A0A] p-2 bg-white/90 flex items-center justify-between">
            <div>
              <span className="block text-[9px] font-mono uppercase font-bold text-neutral-500">
                Full Payment
              </span>
              <span className="font-mono font-black text-[#0A0A0A] uppercase">
                {isFullPayment ? 'SETTLED' : registration.paid_amount > 0 ? 'PARTIAL' : 'UNPAID'}
              </span>
            </div>
            <div
              className={`w-6 h-6 border-2 border-[#0A0A0A] flex items-center justify-center font-black ${
                isFullPayment ? 'bg-[#0A0A0A] text-[#C9A227]' : 'bg-white text-transparent'
              }`}
            >
              ✓
            </div>
          </div>
        </div>
      </div>

      {/* Sign-offs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:gap-3 mt-4 print:mt-2 pt-2.5 print:pt-1 border-t border-[#0A0A0A]/40">
        <div className="text-center">
          <div className="h-9 print:h-7 flex items-end justify-center font-mono font-bold text-xs print:text-[9px] uppercase text-[#0A0A0A]">
            {registration.prepared_by || cashierName}
          </div>
          <div className="border-t border-[#0A0A0A] text-[10px] print:text-[8px] font-mono uppercase font-bold text-neutral-700 pt-0.5 mt-0.5">
            PREPARED BY
          </div>
        </div>

        <div className="text-center">
          <div className="h-9 print:h-7 flex items-center justify-center">
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt="Customer Signature"
                className="max-h-8 print:max-h-6 max-w-full object-contain"
              />
            ) : (
              <span className="text-[10px] print:text-[8px] italic text-neutral-500">Signed digitally on file</span>
            )}
          </div>
          <div className="border-t border-[#0A0A0A] text-[10px] print:text-[8px] font-mono uppercase font-bold text-neutral-700 pt-0.5 mt-0.5">
            CUSTOMER'S SIGNATURE
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      <div className="mt-3 print:mt-1.5 pt-2 print:pt-1 border-t-2 border-[#0A0A0A] text-[9px] print:text-[7px] leading-snug print:leading-tight text-neutral-800">
        <div className="font-mono font-black text-[9.5px] print:text-[7.5px] uppercase text-[#0A0A0A] mb-0.5 tracking-wider">
          TERMS &amp; CONDITIONS:
        </div>
        <ol className="list-decimal pl-3 space-y-0.5 print:space-y-0">
          {RECEIPT_TERMS_CLAUSES.map((clause, index) => (
            <li key={index}>{clause}</li>
          ))}
        </ol>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-1 mt-2 print:mt-1 pt-1.5 print:pt-0.5 border-t border-[#0A0A0A]/40 font-mono font-bold text-[9.5px] print:text-[7.5px] text-[#0A0A0A]">
          <span>FOR INQUIRIES TEXT/CALL: {STUDIO_INFO.phone}</span>
          <span>{STUDIO_INFO.facebook}</span>
        </div>
      </div>
    </article>
  );
};
