import { DataFeedback } from '../../../components/common/DataFeedback';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Loader2, Printer, X, FileText, Receipt } from 'lucide-react';
import type { Registration } from '../../../types';
import { useToast } from '../../../context/ToastContext';
import { formatJobOrderNo } from '../../../utils/formatters';
import { JobOrderSheet } from '../../receipts/JobOrderSheet';
import { PaymentReceiptSheet, StripPage } from '../../receipts/PaymentReceiptSheet';
import {
  loadReceiptData, paymentTypeLabel, peso, printModeFor, receiptDate, receiptLabel, savedReceiptPaper, saveReceiptPaper, statusLabel, stripPaper,
  type PrintMode, type ReceiptData, type ReceiptPaper,
} from '../../receipts/receiptData';

interface PrintReceiptModalProps {
  registration: Registration;
  cashierName: string;
  /** Open the preview for the specified payment. */
  paymentId?: string;
  onClose: () => void;
}

const PREVIEW_WIDTH = 816; // 8.5 in at 96 px/in

function paperFor(mode: PrintMode, receiptPaper: ReceiptPaper): { page: string; hint: string } {
  if (mode === 'joborder') {
    return { page: 'letter portrait', hint: 'Load LETTER bond paper. Cut along the dashed line: top half is the client\'s claim stub, bottom half is the studio copy.' };
  }
  return stripPaper(receiptPaper);
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({ registration, cashierName, paymentId, onClose }) => {
  const { toast } = useToast();
  const [data, setData] = useState<ReceiptData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<PrintMode>('joborder');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [receiptPaper, setReceiptPaper] = useState<ReceiptPaper>(savedReceiptPaper);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let live = true;
    loadReceiptData(registration.id).then((loaded) => {
      if (!live) return;
      const target = loaded.payments.find((payment) => payment.id === paymentId) ?? loaded.payments.at(-1);
      setData(loaded);
      setSelectedId(target?.id ?? '');
      setMode(paymentId ? printModeFor(target, loaded.payments) : 'joborder');
    }).catch((err) => {
      console.error('Failed to load the job order for printing:', err);
      if (live) setFailed(true);
    });
    return () => { live = false; };
  }, [registration.id, paymentId, attempt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Show the real-size sheet scaled down to fit narrow screens.
  useLayoutEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, (node.clientWidth - 2) / PREVIEW_WIDTH)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, data]);

  const payment = data?.payments.find((item) => item.id === selectedId);
  const canReceipt = Boolean(data?.payments.length);
  const activeMode: PrintMode = mode === 'receipt' && payment ? 'receipt' : 'joborder';
  const paper = paperFor(activeMode, receiptPaper);
  let sheet: React.ReactNode = null;
  if (data && activeMode === 'joborder') sheet = <JobOrderSheet data={data} cashierName={cashierName} />;
  else if (data && payment) {
    sheet = <StripPage paper={receiptPaper}><PaymentReceiptSheet data={data} payment={payment} /></StripPage>;
  }

  const choosePaper = (value: ReceiptPaper) => {
    setReceiptPaper(value);
    saveReceiptPaper(value);
  };

  const download = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const pdf = await import('../../receipts/receiptPdf');
      if (activeMode === 'receipt' && payment) await pdf.downloadReceiptPdf(data, payment, receiptPaper);
      else await pdf.downloadJobOrderPdf(data, cashierName);
      toast.success('PDF downloaded.');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Could not make the PDF. Use Print instead.');
    } finally {
      setBusy(false);
    }
  };

  const tab = (value: PrintMode, label: string, Icon: typeof FileText, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setMode(value)}
      aria-pressed={activeMode === value}
      className={`btn-tactile min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        activeMode === value ? 'bg-obsidian text-gold border-line shadow-lux-gold' : 'bg-canvas text-neutral-600 border-neutral-300'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return createPortal(
    <>
      <div role="dialog" aria-modal="true" aria-label="Print job order or receipt"
        className="no-print fixed inset-0 bg-obsidian/85 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="animate-modal bg-panel w-full max-w-[880px] max-h-[94dvh] flex flex-col border-2 border-line shadow-lux-gold">
          <div className="flex flex-col gap-3 p-4 border-b-2 border-line">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gold-soft">Print // Job Order {formatJobOrderNo(registration.job_order_no)}</span>
                <h3 className="text-base sm:text-lg font-black uppercase text-ink m-0 truncate">{registration.family_name}, {registration.given_name}</h3>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="btn-tactile shrink-0 min-h-[40px] px-3 text-ink border border-line bg-canvas hover:bg-neutral-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {tab('joborder', 'Job Order · Letter', FileText)}
              {tab('receipt', 'Payment Receipt · Small', Receipt, !canReceipt)}
              {activeMode === 'receipt' && data && (
                <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label="Payment to print"
                  className="min-w-0 flex-1 sm:flex-none min-h-[40px] px-2 py-1.5 border border-neutral-400 bg-panel text-xs font-bold">
                  {data.payments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {receiptLabel(item)} · {receiptDate(item.created)} · {peso(item.amount)} · {paymentTypeLabel(item)}{statusLabel(item) ? ` (${statusLabel(item)})` : ''}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                <button type="button" onClick={download} disabled={!data || busy}
                  className="btn-tactile flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-canvas text-ink border border-line text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
                </button>
                <button type="button" onClick={() => {
                  try {
                    window.print();
                  } catch {
                    toast.error('Printing could not start. You can print this saved receipt again.');
                  }
                }} disabled={!data}
                  className="btn-tactile flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-gold text-on-gold border border-line text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50">
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>
            {activeMode === 'receipt' && (
              <div role="radiogroup" aria-label="Receipt paper" className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-ink">
                <span>Paper:</span>
                {([['letter', 'Letter sheet'], ['half', 'Leftover piece']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={receiptPaper === value} onClick={() => choosePaper(value)}
                    className={`btn-tactile min-h-[36px] px-3 py-1 border text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                      receiptPaper === value ? 'bg-gold text-on-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-neutral-500 m-0">{paper.hint}</p>
          </div>

          <div ref={previewRef} className="flex-1 min-h-[200px] overflow-auto p-3 sm:p-4 bg-canvas">
            <DataFeedback loading={!data && !failed} error={failed ? 'Could not load the job order.' : undefined}
              loadingMessage="Loading preview…" className="min-h-36 p-6 text-center"
              onRetry={() => { setFailed(false); setAttempt((value) => value + 1); }} />
            {sheet && (
              <div className="mx-auto shadow-lux border border-neutral-300" style={{ zoom: scale, width: 'fit-content' }}>
                {sheet}
              </div>
            )}
          </div>
        </div>
      </div>

      {sheet && (
        <div className="sf-print-root">
          <style>{`@media print { @page { size: ${paper.page}; margin: 0; } }`}</style>
          {sheet}
        </div>
      )}
    </>,
    document.body,
  );
};
