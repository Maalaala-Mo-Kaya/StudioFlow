import { useState, type ReactNode } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Download, Printer, QrCode } from 'lucide-react';
import { downloadBlob } from '../../../utils/downloadBlob';
import type { QrImage } from '../../../utils/qrImage';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { managedQrUrl, type QrKind } from './qrCodes';

export interface QrPreviewData {
  kind: QrKind;
  title: string;
  detail: string;
  security?: string;
  image: QrImage;
}

export function QrGraphic({ image, className }: { image: QrImage; className: string }) {
  return (
    <svg role="img" aria-label="Scannable QR code" viewBox={`0 0 ${image.size} ${image.size}`}
      className={className} shapeRendering="crispEdges">
      <rect width={image.size} height={image.size} fill="#fff" />
      <path d={image.path} fill="#000" />
    </svg>
  );
}

export function ManagedQrAddress({ slug }: { slug: string }) {
  const address = managedQrUrl(slug);
  const { hostname } = new URL(address);
  const loopback = hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname);
  return (
    <div className="space-y-1">
      <p className="break-all font-mono text-xs text-neutral-700">{address}</p>
      {loopback && (
        <p className="text-sm text-gold">This address works on the server computer. Open StudioFlow at its network address before downloading a code for phones.</p>
      )}
    </div>
  );
}

async function exportImage({ title, image }: QrPreviewData, format: 'png' | 'svg') {
  const filename = title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'studioflow-qr';
  const { size, path } = image;
  // Use a whole number of pixels per module to preserve crisp edges in PNG.
  const pixels = size * Math.ceil(1024 / size);
  const svg = new Blob([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`,
  ], { type: 'image/svg+xml' });
  if (format === 'svg') {
    downloadBlob(svg, `${filename}.svg`);
    return;
  }
  const url = URL.createObjectURL(svg);
  try {
    const graphic = new Image();
    graphic.src = url;
    await graphic.decode();
    const canvas = document.createElement('canvas');
    canvas.width = pixels;
    canvas.height = pixels;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.imageSmoothingEnabled = false;
    context.drawImage(graphic, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG conversion failed.');
    downloadBlob(blob, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QrPreview({ preview, children }: { preview: QrPreviewData | null; children?: ReactNode }) {
  const [printing, setPrinting] = useState<QrPreviewData | null>(null);
  const [downloadError, setDownloadError] = useState('');

  function print(data: QrPreviewData) {
    window.addEventListener('afterprint', () => setPrinting(null), { once: true });
    flushSync(() => setPrinting(data));
    window.print();
  }

  async function download(data: QrPreviewData, format: 'png' | 'svg') {
    setDownloadError('');
    try {
      await exportImage(data, format);
    } catch {
      setDownloadError('The download could not be created. Try again.');
    }
  }

  return (
    <section className={`${stationCard} min-w-0 space-y-4`} aria-labelledby="qr-preview-heading">
      <h2 id="qr-preview-heading" className="font-black uppercase tracking-wide text-ink">QR Preview</h2>
      {preview ? (
        <>
          <div className="bg-obsidian border border-line p-4 text-center">
            <h3 className="text-lg font-black text-gold break-words">{preview.title}</h3>
            <p className="mt-1 text-sm text-ink break-words">{preview.detail}</p>
            {preview.security && <p className="text-xs text-gold-soft">{preview.security}</p>}
            <QrGraphic image={preview.image} className="mx-auto mt-4 block w-full max-w-64" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={stationButton} onClick={() => void download(preview, 'png')}><Download size={15} /> Download PNG</button>
            <button type="button" className={stationButton} onClick={() => void download(preview, 'svg')}><Download size={15} /> Download SVG</button>
            <button type="button" className={stationButton} onClick={() => print(preview)}><Printer size={15} /> Print QR Code</button>
          </div>
          {downloadError && <p role="alert" className="text-sm text-red-600">{downloadError}</p>}
        </>
      ) : (
        <div className="grid min-h-52 place-content-center justify-items-center gap-3 border border-dashed border-line bg-canvas p-4 text-center text-sm text-neutral-700">
          <QrCode className="size-12 text-gold" aria-hidden="true" />
          <p>Generate a QR code to preview it here.</p>
        </div>
      )}
      {children}
      {printing && createPortal(
        <div className="sf-print-root theme-paper">
          <section style={{ color: '#111', background: '#fff', textAlign: 'center', padding: '0.6in' }}>
            <p style={{ letterSpacing: '.18em', fontSize: '11pt' }}>STUDIOFLOW</p>
            <h1 style={{ fontSize: '25pt', overflowWrap: 'anywhere' }}>{printing.title}</h1>
            <p style={{ overflowWrap: 'anywhere' }}>{printing.detail}</p>
            <QrGraphic image={printing.image} className="mx-auto block w-full max-w-[4in]" />
            <p style={{ fontWeight: 'bold', fontSize: '14pt' }}>
              {printing.kind === 'wifi' ? 'SCAN TO CONNECT TO WI-FI' : 'SCAN TO OPEN THE LINK'}
            </p>
          </section>
        </div>, document.body,
      )}
    </section>
  );
}
