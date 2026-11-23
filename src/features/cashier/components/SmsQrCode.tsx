import { useEffect, useState } from 'react';
import { makeQrImage, type QrImage } from '../../../utils/qrImage';

interface SmsQrCodeProps {
  /** Mobile number in 09XXXXXXXXX form. */
  mobile: string;
  message: string;
}

/**
 * A QR code that opens the phone's Messages app with the number and text filled in
 * (SMSTO format, read by the Android and iPhone cameras). Works offline: the
 * cashier scans it with the studio phone and presses Send.
 */
export function SmsQrCode({ mobile, message }: Readonly<SmsQrCodeProps>) {
  const [qr, setQr] = useState<QrImage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    makeQrImage(`SMSTO:${mobile}:${message}`)
      .then((image) => { if (active) { setQr(image); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [mobile, message]);

  if (failed) return <p className="text-[10px] text-red-600">The QR code could not be created. Use Copy Message instead.</p>;
  return (
    // QR codes need dark modules on a light background in both themes.
    <div className="theme-paper inline-block bg-white p-1 border border-line">
      {qr ? (
        <svg role="img" aria-label={`QR code: text ${mobile}`} viewBox={`0 0 ${qr.size} ${qr.size}`}
          width={176} height={176} shapeRendering="crispEdges">
          <rect width={qr.size} height={qr.size} fill="#ffffff" />
          <path d={qr.path} fill="#000000" />
        </svg>
      ) : (
        <div className="w-[176px] h-[176px] flex items-center justify-center text-[10px] text-neutral-500">Loading QR…</div>
      )}
    </div>
  );
}
