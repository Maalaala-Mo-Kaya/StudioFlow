import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, Loader2, Printer, X, Copy } from 'lucide-react';
import type { Registration } from '../../../types';
import { YellowFormReceipt } from '../../../components/YellowFormReceipt';
import { generateSignedYellowFormPdf } from '../../../utils/generateSignedPdf';
import { useToast } from '../../../context/ToastContext';

interface PrintReceiptModalProps {
  registration: Registration;
  copyType?: 'customer' | 'owner' | 'both';
  onCopyTypeChange?: (type: 'customer' | 'owner') => void;
  cashierName: string;
  onClose: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  registration,
  cashierName,
  onClose,
}) => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'both' | 'customer' | 'owner'>('both');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      await generateSignedYellowFormPdf(registration, {
        copyType: 'both',
        cashierName,
        autoDownload: true,
      });
      toast.success('Official 2-Page Signed PDF generated and downloaded');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      toast.error('Unable to generate PDF file. Please use the Print Receipt button to print directly.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-[#0A0A0A]/85 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="animate-modal bg-white max-w-4xl xl:max-w-5xl w-full p-4 sm:p-6 border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#C9A227] my-auto max-h-[94dvh] overflow-y-auto transition-all">
        {/* Top Control Bar (Screen Only) */}
        <div className="no-print flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pb-4 border-b-2 border-[#0A0A0A] mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`btn-tactile px-3 py-1.5 text-xs font-black uppercase tracking-wider border cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'both'
                  ? 'bg-[#0A0A0A] text-[#C9A227] border-[#0A0A0A] shadow-[2px_2px_0px_#C9A227]'
                  : 'bg-[#F8F7F4] text-neutral-600 border-neutral-300'
              }`}
            >
              <Copy className="w-3.5 h-3.5" /> Both Copies (2 Pages)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('customer')}
              className={`btn-tactile px-3 py-1.5 text-xs font-black uppercase tracking-wider border cursor-pointer ${
                viewMode === 'customer'
                  ? 'bg-[#C9A227] text-[#0A0A0A] border-[#0A0A0A]'
                  : 'bg-[#F8F7F4] text-neutral-600 border-neutral-300'
              }`}
            >
              Yellow Form (Customer)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('owner')}
              className={`btn-tactile px-3 py-1.5 text-xs font-black uppercase tracking-wider border cursor-pointer ${
                viewMode === 'owner'
                  ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                  : 'bg-[#F8F7F4] text-neutral-600 border-neutral-300'
              }`}
            >
              White Copy (Studio)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="btn-tactile flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-2 px-4 py-1.5 bg-[#C9A227] text-[#0A0A0A] border border-[#0A0A0A] text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
              title="Download 2-Page Signed PDF directly to your device"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Compiling...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" /> Download 2-Page PDF
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-tactile flex-1 sm:flex-initial min-h-[40px] flex items-center justify-center gap-2 px-4 py-1.5 bg-[#0A0A0A] text-[#C9A227] border border-[#0A0A0A] text-xs font-black uppercase tracking-widest cursor-pointer shadow-[2px_2px_0px_#C9A227]"
              title="Print Page 1 (Yellow) & Page 2 (White) in a single print command"
            >
              <Printer className="w-4 h-4" /> Print Both Pages
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-tactile min-h-[40px] px-3 text-[#0A0A0A] border border-[#0A0A0A] bg-[#F8F7F4] hover:bg-neutral-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRINT LAYOUT: Strictly Outputs Both Pages in Single Print Job */}
        <div className="print-only">
          <div className="receipt-page">
            <YellowFormReceipt
              registration={registration}
              copyType="customer"
              cashierName={cashierName}
            />
          </div>
          <div className="print-page-break" />
          <div className="receipt-page">
            <YellowFormReceipt
              registration={registration}
              copyType="owner"
              cashierName={cashierName}
            />
          </div>
        </div>

        {/* SCREEN PREVIEW LAYOUT */}
        <div className="no-print">
          {viewMode === 'both' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-dashed border-[#C9A227] pb-1.5">
                <span className="font-mono text-[11px] font-black uppercase text-[#9A7816] bg-[#FDF8E4] px-2.5 py-0.5 border border-[#C9A227]">
                  PAGE 1: Customer Claiming Stub // Yellow Form
                </span>
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                  Sheet 1 of 2
                </span>
              </div>
              <YellowFormReceipt
                registration={registration}
                copyType="customer"
                cashierName={cashierName}
              />

              <div className="flex items-center justify-between border-b border-dashed border-neutral-400 pt-6 pb-1.5">
                <span className="font-mono text-[11px] font-black uppercase text-neutral-800 bg-neutral-100 px-2.5 py-0.5 border border-neutral-400">
                  PAGE 2: Studio Accounting Copy // White Form
                </span>
                <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
                  Sheet 2 of 2
                </span>
              </div>
              <YellowFormReceipt
                registration={registration}
                copyType="owner"
                cashierName={cashierName}
              />
            </div>
          ) : (
            <YellowFormReceipt
              registration={registration}
              copyType={viewMode}
              cashierName={cashierName}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
