import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, MessageSquare, X, BellRing } from 'lucide-react';
import type { Registration } from '../../../types';
import { buildPickupMessage, normalizeMobile, smsCount, smsLink } from '../../../utils/pickupMessage';
import { PickupNoticeInfo } from './PickupNoticeInfo';
import { SmsQrCode } from './SmsQrCode';
import { formatClientName, formatCurrency } from '../../../utils/formatters';

interface NotifyPickupModalProps {
  registration: Registration;
  /** The studio's message template (Admin → Production & Pickup). */
  template: string;
  onClose: () => void;
  onMarkNotified: (reg: Registration) => Promise<void>;
}

/**
 * Pickup notice: shows the text message for the client so the cashier can send it from the
 * studio phone (copy, or open the messaging app), then records that the client was told.
 */
export const NotifyPickupModal: React.FC<NotifyPickupModalProps> = ({ registration: reg, template, onClose, onMarkNotified }) => {
  const [message, setMessage] = useState(() => buildPickupMessage(reg, template));
  const [copied, setCopied] = useState<'message' | 'number' | ''>('');
  const [saving, setSaving] = useState(false);
  const mobile = normalizeMobile(reg.mobile_number);
  const { texts, unicode } = smsCount(message);

  const copy = async (what: 'message' | 'number', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // Clipboard needs a secure context; on plain-HTTP LAN pages the text stays selectable below.
      setCopied('');
    }
  };

  const markNotified = async () => {
    setSaving(true);
    try { await onMarkNotified(reg); } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 modal-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="notify-pickup-title"
        className="w-full max-w-lg bg-canvas border-2 border-line shadow-lux p-6 space-y-4 font-mono text-xs max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div>
            <h3 id="notify-pickup-title" className="text-sm font-black uppercase tracking-wider text-ink flex items-center gap-2">
              <BellRing className="w-4 h-4 text-gold" /> Notify Client: Ready for Pickup
            </h3>
            <p className="text-neutral-500">Job Order: {reg.job_order_no}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-8 h-8 flex items-center justify-center bg-panel border border-line hover:bg-gold hover:text-on-gold cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 bg-panel border border-line space-y-2">
          <div className="font-black text-sm uppercase text-ink">{formatClientName(reg)}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Mobile:</span>
            {mobile ? (
              <>
                <span className="text-sm font-black text-ink tracking-wider">{mobile}</span>
                <button type="button" onClick={() => void copy('number', mobile)}
                  className="btn-tactile inline-flex items-center gap-1 px-2 py-0.5 border border-line bg-canvas text-[10px] font-bold uppercase cursor-pointer">
                  {copied === 'number' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />} Copy number
                </button>
              </>
            ) : (
              <span className="text-red-600 font-bold">
                {reg.mobile_number ? `"${reg.mobile_number}" is not a valid mobile number` : 'No mobile number on file'}
                {reg.email ? ` · Email: ${reg.email}` : ''}
              </span>
            )}
          </div>
          {reg.balance > 0 && (
            <div className="text-red-700 font-bold">Unpaid balance: {formatCurrency(reg.balance)}. The message tells the client to settle it upon pickup.</div>
          )}
          <PickupNoticeInfo reg={reg} />
        </div>

        <div>
          <label htmlFor="pickup-message" className="block font-black uppercase text-ink mb-1">Text Message</label>
          <textarea id="pickup-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
            className="w-full p-2.5 bg-panel border border-line text-ink text-xs leading-relaxed font-sans" />
          <div className="flex justify-between text-[10px] text-neutral-500">
            <span className={texts > 1 ? 'text-amber-700 font-bold' : ''}>
              {message.length} characters · {texts === 1 ? '1 text' : `${texts} texts`}
              {unicode && ' (special characters such as ₱ or emoji shorten each text to 70 characters)'}
            </span>
            <button type="button" onClick={() => setMessage(buildPickupMessage(reg, template))} className="underline cursor-pointer">Reset text</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => void copy('message', message)}
            className="btn-tactile min-h-[42px] inline-flex items-center justify-center gap-2 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer">
            {copied === 'message' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied === 'message' ? 'Copied' : 'Copy Message'}
          </button>
          {mobile ? (
            <a href={smsLink(mobile, message)}
              className="btn-tactile min-h-[42px] inline-flex items-center justify-center gap-2 bg-panel text-ink border border-line font-black uppercase">
              <MessageSquare className="w-4 h-4" /> Open in Messages
            </a>
          ) : <span />}
        </div>
        {mobile && (
          <div className="flex items-center gap-4 p-3 bg-panel border border-line">
            <SmsQrCode mobile={mobile} message={message} />
            <div className="space-y-1.5 text-[11px] leading-relaxed">
              <div className="font-black uppercase text-ink">Scan with the studio phone</div>
              <ol className="list-decimal pl-4 text-neutral-600 space-y-0.5">
                <li>Open the phone camera and point it at the code.</li>
                <li>Tap the link that appears. Messages opens with the number and text filled in.</li>
                <li>Press Send, then <strong>Mark as Notified</strong> below.</li>
              </ol>
            </div>
          </div>
        )}
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          You can also copy the text, use “Open in Messages” on a phone or a PC linked to one, or call the client.
          Then press <strong>Mark as Notified</strong> so everyone can see the client was told.
        </p>

        <div className="flex gap-3 pt-3 border-t-2 border-line">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 font-bold uppercase bg-panel text-ink border-2 border-line btn-tactile cursor-pointer">
            Close
          </button>
          <button type="button" onClick={() => void markNotified()} disabled={saving}
            className="flex-1 py-2.5 font-black uppercase bg-emerald-600 text-white border-2 border-emerald-600 btn-tactile cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : reg.pickup_notified_at ? 'Mark Notified Again' : 'Mark as Notified'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
