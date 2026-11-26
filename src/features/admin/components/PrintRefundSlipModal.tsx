import { DataFeedback } from '../../../components/common/DataFeedback';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Loader2, PenLine, Printer, X } from 'lucide-react';
import type { RefundRecord, Registration } from '../../../types';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { formatJobOrderNo } from '../../../utils/formatters';
import { SignaturePad } from '../../../components/SignaturePad';
import { StripPage } from '../../receipts/PaymentReceiptSheet';
import { RefundSlipSheet } from '../../receipts/RefundSlipSheet';
import { refreshClientDocuments } from '../../receipts/clientDocuments';
import {
  loadRefundSignature, loadRefundSlipData, receiptDate, refundAcknowledgment, savedReceiptPaper, saveReceiptPaper, stripPaper,
  type ReceiptPaper, type RefundSlipData,
} from '../../receipts/receiptData';

interface PrintRefundSlipModalProps {
  registration: Registration;
  refund: RefundRecord;
  /** Shown once, right after the refund is recorded. */
  justRecorded?: boolean;
  onClose: () => void;
}

const PREVIEW_WIDTH = 816; // 8.5 in at 96 px/in

/** Prints the refund slip: the client signs the studio copy as proof the money was received. */
export const PrintRefundSlipModal: React.FC<PrintRefundSlipModalProps> = ({ registration, refund: initialRefund, justRecorded, onClose }) => {
  const { toast } = useToast();
  const [data, setData] = useState<RefundSlipData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paper, setPaper] = useState<ReceiptPaper>(savedReceiptPaper);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // The refund as saved now (it gains the signature once the client signs).
  const [refund, setRefund] = useState(initialRefund);
  const [signature, setSignature] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const refundId = initialRefund.id;

  useEffect(() => {
    let live = true;
    loadRefundSlipData(registration.id).then(async (loaded) => {
      // The refund just saved may not be in the list yet: add it so the figures include it.
      const saved = loaded.refunds.find((item) => item.id === refundId);
      const refunds = saved ? loaded.refunds : [...loaded.refunds, initialRefund];
      const image = saved ? await loadRefundSignature(saved) : null;
      if (!live) return;
      if (saved) setRefund(saved);
      setSignature(image);
      setData({ ...loaded, refunds });
    }).catch((err) => {
      console.error('Failed to load the refund slip:', err);
      if (live) setFailed(true);
    });
    return () => { live = false; };
    // initialRefund is the same object while the window is open; the signature step updates `refund` locally.
  }, [registration.id, refundId, initialRefund, attempt]);

  const saveSignature = async () => {
    if (!drawn) return;
    setSigning(true);
    try {
      const form = new FormData();
      form.append('signature', drawn.blob, 'refund-signature.png');
      const saved = await pb.send<RefundRecord>(`/api/studioflow/refunds/${refund.id}/signature`, { method: 'POST', body: form });
      setRefund(saved);
      setSignature(drawn.dataUrl);
      setDrawn(null);
      toast.success(`Client signature saved on ${saved.refund_no}.`);
      refreshClientDocuments(registration.id, toast.warning);
    } catch (err) {
      console.error('Failed to save the refund signature:', err);
      const message = (err as { response?: { message?: string } })?.response?.message;
      toast.error(message || 'Could not save the signature. Please try again.');
    } finally {
      setSigning(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, (node.clientWidth - 2) / PREVIEW_WIDTH)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [data]);

  const page = stripPaper(paper);
  const sheet = data ? <StripPage paper={paper}><RefundSlipSheet data={data} refund={refund} signature={signature} /></StripPage> : null;

  const choosePaper = (value: ReceiptPaper) => {
    setPaper(value);
    saveReceiptPaper(value);
  };

  const download = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const pdf = await import('../../receipts/receiptPdf');
      await pdf.downloadRefundSlipPdf(data, refund, paper, signature);
      toast.success('PDF downloaded.');
    } catch (err) {
      console.error('Failed to generate the refund slip PDF:', err);
      toast.error('Could not make the PDF. Use Print instead.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <>
      <div role="dialog" aria-modal="true" aria-label="Print refund slip"
        className="no-print fixed inset-0 bg-obsidian/85 z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="animate-modal bg-panel w-full max-w-[880px] max-h-[94dvh] flex flex-col border-2 border-line shadow-lux-gold">
          <div className="flex flex-col gap-3 p-4 border-b-2 border-line overflow-y-auto max-h-[70dvh] shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gold-soft">
                  Refund Slip // {refund.refund_no} · Job Order {formatJobOrderNo(registration.job_order_no)}
                </span>
                <h3 className="text-base sm:text-lg font-black uppercase text-ink m-0 truncate">{registration.family_name}, {registration.given_name}</h3>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="btn-tactile shrink-0 min-h-[40px] px-3 text-ink border border-line bg-canvas hover:bg-neutral-200 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {justRecorded && (
              <p role="status" className="m-0 p-2 border border-emerald-500 bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                Refund {refund.refund_no} recorded. Hand over the money, have the client sign below, then print the slip.
              </p>
            )}

            {data && !refund.signature && (
              <section aria-label="Client signature" className="border border-line bg-canvas p-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-ink">Client signature · money received</div>
                <p className="m-0 text-[11px] text-neutral-600">{refundAcknowledgment(data, refund)}</p>
                <SignaturePad key={padKey} height={140}
                  onChange={(blob, dataUrl) => setDrawn(blob && dataUrl ? { blob, dataUrl } : null)} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void saveSignature()} disabled={!drawn || signing}
                    className="btn-tactile min-h-[40px] inline-flex items-center gap-2 px-4 py-1.5 bg-obsidian text-gold border border-line text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-40">
                    {signing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />} Save client signature
                  </button>
                  <button type="button" onClick={() => { setDrawn(null); setPadKey((key) => key + 1); }} disabled={signing}
                    className="btn-tactile min-h-[40px] px-3 py-1.5 bg-panel text-ink border border-line text-xs font-bold uppercase cursor-pointer">
                    Start over
                  </button>
                  <span className="text-[10px] text-neutral-500">Saved once and can&apos;t be changed. No pad? Print and have the client sign on paper.</span>
                </div>
              </section>
            )}
            {refund.signature && (
              <p className="m-0 p-2 border border-line bg-gold-wash text-ink text-[11px] font-bold inline-flex items-center gap-2">
                <PenLine className="w-3.5 h-3.5" />
                Client signed on screen {refund.signed_at ? receiptDate(refund.signed_at, true) : ''}{refund.signed_witness ? ` · witnessed by ${refund.signed_witness}` : ''}.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Slip paper" className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-ink">
                <span>Paper:</span>
                {([['letter', 'Letter sheet'], ['half', 'Leftover piece']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={paper === value} onClick={() => choosePaper(value)}
                    className={`btn-tactile min-h-[36px] px-3 py-1 border text-[10px] font-black uppercase tracking-wider cursor-pointer ${
                      paper === value ? 'bg-gold text-on-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                <button type="button" onClick={download} disabled={!data || busy}
                  className="btn-tactile flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-canvas text-ink border border-line text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} PDF
                </button>
                <button type="button" onClick={() => window.print()} disabled={!data}
                  className="btn-tactile flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-1.5 bg-gold text-on-gold border border-line text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50">
                  <Printer className="w-4 h-4" /> Print
                </button>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 m-0">{page.hint}</p>
          </div>

          <div ref={previewRef} className="flex-1 min-h-[200px] overflow-auto p-3 sm:p-4 bg-canvas">
            <DataFeedback loading={!data && !failed} error={failed ? 'Could not load the refund.' : undefined}
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
          <style>{`@media print { @page { size: ${page.page}; margin: 0; } }`}</style>
          {sheet}
        </div>
      )}
    </>,
    document.body,
  );
};
