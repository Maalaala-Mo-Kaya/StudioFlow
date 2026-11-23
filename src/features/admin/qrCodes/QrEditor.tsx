import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff, Link, LockKeyhole, QrCode, RotateCcw, Save, Wifi } from 'lucide-react';
import { makeQrImage } from '../../../utils/qrImage';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { ManagedQrAddress, QrPreview, type QrPreviewData } from './QrPreview';
import {
  destinationUrl, loadWifiPassword, managedQrUrl, qrError, qrKindLabels, qrTitle, saveQr, validateAccessPassword,
  wifiPayload, wifiSecurityLabels, type QrKind, type SavedQr, type WifiSecurity,
} from './qrCodes';

const types = [
  { kind: 'direct', icon: Link, hint: 'Open a website' },
  { kind: 'protected', icon: LockKeyhole, hint: 'Require an access password' },
  { kind: 'wifi', icon: Wifi, hint: 'Join a Wi-Fi network' },
] as const;
const fieldClass = 'min-h-11 w-full min-w-0 border border-line bg-canvas px-3 py-2 text-sm text-ink';
const secondary = `${stationButton} bg-canvas! text-ink! hover:text-gold!`;

function Field({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-bold text-ink">{title}</label>
      {children}
    </div>
  );
}

export function QrEditor({ record, onCancel, onNew }: {
  record: SavedQr | null;
  onCancel: () => void;
  onNew: () => void;
}) {
  const [kind, setKind] = useState<QrKind>(record?.kind ?? 'direct');
  const [name, setName] = useState(record?.name ?? '');
  const [destination, setDestination] = useState(record?.destination ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [expiresOn, setExpiresOn] = useState(record?.expiresOn ?? '');
  const [ssid, setSsid] = useState(record?.ssid ?? '');
  const [security, setSecurity] = useState<WifiSecurity>(record?.security || 'WPA');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hiddenNetwork, setHiddenNetwork] = useState(record?.hiddenNetwork ?? false);
  const [preview, setPreview] = useState<QrPreviewData | null>(null);
  const [saved, setSaved] = useState(record);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const wifiSettings = { kind: 'wifi', name, ssid, security, hiddenNetwork } as const;
  const storedWifiPassword = saved?.hasWifiPassword && saved.security === security;

  function clearPreview() {
    setPreview(null);
    setError('');
    setNotice('');
  }

  function select(next: QrKind) {
    if (next === kind || busy) return;
    setKind(next);
    setSaved(null);
    setPassword('');
    setConfirmPassword('');
    setWifiPassword('');
    setShowPassword(false);
    clearPreview();
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    clearPreview();
    setBusy(true);
    let payload: string;
    try {
      const availableWifiPassword = kind === 'wifi' && !wifiPassword && storedWifiPassword && saved
        ? await loadWifiPassword(saved.id) : wifiPassword;
      payload = kind === 'wifi' ? wifiPayload(wifiSettings, availableWifiPassword) : destinationUrl(destination);
      if (kind === 'protected') validateAccessPassword(password, confirmPassword, !saved);
    } catch (problem) {
      setError(qrError(problem, problem instanceof Error ? problem.message : 'Check the QR settings.'));
      setBusy(false);
      return;
    }
    try {
      let detail = kind === 'wifi' ? `Network: ${ssid}` : new URL(payload).host;
      if (kind === 'protected') {
        const updated = await saveQr({
          kind, name, destination: payload, password, confirmPassword, expiresOn,
        }, saved?.id);
        setSaved(updated);
        payload = managedQrUrl(updated.slug);
        detail = 'Password required';
        setPassword('');
        setConfirmPassword('');
        setNotice('Protected link saved. Scanners need access to the StudioFlow server.');
      } else if (kind === 'direct' && saved) {
        const updated = await saveQr({ kind, name, destination: payload }, saved.id);
        setSaved(updated);
        payload = managedQrUrl(updated.slug);
        setNotice('Changes saved. The managed QR address is unchanged.');
      }
      const image = await makeQrImage(payload);
      setPreview({
        kind, title: qrTitle(kind, name), detail, image,
        security: kind === 'wifi' ? wifiSecurityLabels[security] + (hiddenNetwork ? ' · Hidden network' : '') : undefined,
      });
      if (kind === 'wifi') setShowPassword(false);
    } catch (problem) {
      setError(qrError(problem, 'The QR code could not be generated. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function savePreview() {
    if (!preview || kind === 'protected') return;
    setBusy(true);
    setError('');
    try {
      const settings = kind === 'wifi'
        ? { ...wifiSettings, wifiPassword: security === 'nopass' ? '' : wifiPassword }
        : { kind, name, destination: destinationUrl(destination) };
      const updated = await saveQr(settings, saved?.id);
      setSaved(updated);
      if (kind === 'direct') {
        const image = await makeQrImage(managedQrUrl(updated.slug));
        setPreview({ ...preview, image });
        setNotice('Managed QR code saved. Download this version to keep the printed code editable.');
      } else {
        setWifiPassword('');
        setNotice(updated.hasWifiPassword ? 'Wi-Fi connection and encrypted password saved.' : 'Open Wi-Fi connection saved.');
      }
    } catch (problem) {
      setError(qrError(problem, 'The QR code could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {record ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black text-ink">Edit {qrTitle(record.kind, record.name)}</h2>
          <button type="button" className={secondary} onClick={onCancel} disabled={busy}>Back to Saved QR Codes</button>
        </div>
      ) : (
        <>
          {saved && (
            <button type="button" className={secondary} onClick={onNew} disabled={busy}>New QR Code</button>
          )}
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="QR code type">
            {types.map(({ kind: type, icon: Icon, hint }) => (
              <button key={type} type="button" aria-pressed={type === kind} disabled={busy} onClick={() => select(type)}
                className={`flex min-h-20 items-center gap-3 border-2 p-3 text-left ${type === kind
                  ? 'border-gold bg-obsidian shadow-lux-gold' : 'border-line bg-panel hover:border-gold'}`}>
                <Icon className="size-5 shrink-0 text-gold" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-ink">{qrKindLabels[type]}</span>
                  <span className="block text-xs text-neutral-700">{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="grid items-start gap-4 md:grid-cols-2">
        <form ref={form} onSubmit={(event) => void generate(event)} onChange={clearPreview} className={stationCard}>
          <h2 className="mb-4 font-black uppercase tracking-wide text-ink">Configuration</h2>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <Field id="qr-name" title="QR Code Name (optional)">
              <input id="qr-name" className={fieldClass} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            {kind === 'wifi' ? (
              <>
                <Field id="qr-ssid" title="Wi-Fi Network Name (SSID)">
                  <input id="qr-ssid" className={fieldClass} required maxLength={32} autoComplete="off" value={ssid} onChange={(event) => setSsid(event.target.value)} />
                </Field>
                <Field id="qr-security" title="Security Type">
                  <select id="qr-security" className={fieldClass} value={security} onChange={(event) => {
                    setSecurity(event.target.value as WifiSecurity);
                    setWifiPassword('');
                    setShowPassword(false);
                  }}>
                    {Object.entries(wifiSecurityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                {security === 'WPA' && <p className="text-xs text-neutral-700">WPA3-only networks may need a compatible phone and scanner.</p>}
                {security !== 'nopass' && (
                  <Field id="qr-wifi-password" title={storedWifiPassword ? 'New Wi-Fi Password (optional)' : 'Wi-Fi Password'}>
                    <div className="flex gap-2">
                      <input id="qr-wifi-password" className={fieldClass} type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password" spellCheck={false} required={!storedWifiPassword} maxLength={128} value={wifiPassword}
                        onChange={(event) => setWifiPassword(event.target.value)} />
                      <button type="button" className={secondary} onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide Wi-Fi password' : 'Show Wi-Fi password'}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {storedWifiPassword && <p className="text-xs text-neutral-700">Leave blank to use the saved password.</p>}
                  </Field>
                )}
                <label className="flex items-center gap-2 text-sm font-bold text-ink">
                  <input type="checkbox" className="size-4 accent-gold" checked={hiddenNetwork}
                    onChange={(event) => setHiddenNetwork(event.target.checked)} />
                  This is a hidden Wi-Fi network
                </label>
                <p className="text-xs leading-relaxed text-neutral-700">
                  Anyone with the QR image can retrieve its encoded password. Use a separate guest network for clients.
                  Generate and reprint the code whenever Wi-Fi credentials change.
                </p>
              </>
            ) : (
              <>
                <Field id="qr-url" title="Destination URL">
                  <input id="qr-url" className={fieldClass} type="url" required maxLength={1800} placeholder="https://example.com"
                    value={destination} onChange={(event) => setDestination(event.target.value)} />
                </Field>
                {kind === 'protected' && (
                  <>
                    <Field id="qr-password" title={saved ? 'New Access Password (optional)' : 'Access Password'}>
                      <input id="qr-password" className={fieldClass} type="password" autoComplete="new-password"
                        required={!saved} maxLength={71} value={password} onChange={(event) => setPassword(event.target.value)} />
                    </Field>
                    <Field id="qr-confirm-password" title="Confirm Password">
                      <input id="qr-confirm-password" className={fieldClass} type="password" autoComplete="new-password"
                        required={!saved || !!password} maxLength={71} value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)} />
                    </Field>
                    <Field id="qr-expiration" title="Expiration Date (optional)">
                      <input id="qr-expiration" className={fieldClass} type="date" value={expiresOn}
                        onChange={(event) => setExpiresOn(event.target.value)} />
                    </Field>
                    <p className="text-xs leading-relaxed text-neutral-700">
                      Links expire at the end of the selected studio day (UTC+8). Scanners can share a public destination after opening it.
                    </p>
                  </>
                )}
              </>
            )}
            <button type="submit" className={stationButton}>
              <QrCode size={16} aria-hidden="true" />
              {busy ? 'Working…' : saved && kind !== 'wifi' ? 'Save Changes & Preview'
                : kind === 'protected' ? 'Generate & Save QR Code' : 'Generate QR Code'}
            </button>
          </fieldset>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        </form>
        <QrPreview preview={preview}>
          {preview && (
            <div className="flex flex-wrap gap-2">
              {((kind === 'direct' && !saved) || kind === 'wifi') && (
                <button type="button" className={stationButton} disabled={busy} onClick={() => void savePreview()}>
                  <Save size={16} aria-hidden="true" /> {kind === 'wifi'
                    ? (saved ? 'Update Wi-Fi Connection' : 'Save Wi-Fi Connection') : 'Save Managed QR Code'}
                </button>
              )}
              {kind === 'wifi' && (
                <button type="button" className={secondary} disabled={busy} onClick={() => {
                  clearPreview();
                  form.current?.querySelector<HTMLInputElement>('#qr-ssid')?.focus();
                }}>
                  <RotateCcw size={16} aria-hidden="true" /> Generate Again
                </button>
              )}
            </div>
          )}
          {preview && kind === 'direct' && !saved && (
            <p className="text-xs text-neutral-700">This code opens the destination directly. Save a managed version to edit the destination later.</p>
          )}
          {preview && kind === 'wifi' && security !== 'nopass' && <p className="text-xs text-neutral-700">Saving this connection stores its password encrypted on the StudioFlow server so admins can recreate the QR code.</p>}
          {preview && saved?.slug && <ManagedQrAddress slug={saved.slug} />}
          {notice && <p role="status" className="text-sm text-gold">{notice}</p>}
        </QrPreview>
      </div>
    </div>
  );
}
