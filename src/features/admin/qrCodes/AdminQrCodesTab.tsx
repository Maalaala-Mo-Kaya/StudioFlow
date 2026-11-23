import { useState } from 'react';
import { Archive, QrCode } from 'lucide-react';
import { stationButton } from '../../workflow/StationLayout';
import { QrEditor } from './QrEditor';
import { SavedQrCodes } from './SavedQrCodes';
import type { SavedQr } from './qrCodes';

export function AdminQrCodesTab() {
  const [showSaved, setShowSaved] = useState(false);
  const [editing, setEditing] = useState<SavedQr | null>(null);
  const [newEditor, setNewEditor] = useState(0);

  function show(saved: boolean) {
    setShowSaved(saved);
    setEditing(null);
  }

  return (
    <section className="space-y-4" aria-labelledby="qr-module-heading">
      <header className="border-2 border-line bg-obsidian p-5 shadow-lux-gold sm:p-6">
        <h1 id="qr-module-heading" className="text-xl font-black uppercase tracking-tight text-gold sm:text-2xl">QR Code Generator</h1>
        <div role="group" aria-label="QR Code Generator sections" className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${stationButton} ${!showSaved ? '' : 'bg-canvas! text-ink!'}`}
            aria-pressed={!showSaved} onClick={() => show(false)}><QrCode size={16} /> Generate QR Code</button>
          <button type="button" className={`${stationButton} ${showSaved ? '' : 'bg-canvas! text-ink!'}`}
            aria-pressed={showSaved} onClick={() => show(true)}><Archive size={16} /> Saved QR Codes</button>
        </div>
      </header>
      {showSaved && !editing ? <SavedQrCodes onEdit={setEditing} />
        : <QrEditor key={editing?.id ?? newEditor} record={editing} onCancel={() => show(true)}
          onNew={() => setNewEditor((current) => current + 1)} />}
    </section>
  );
}
