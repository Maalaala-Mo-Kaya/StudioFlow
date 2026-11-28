import React, { useState } from 'react';
import { AlertTriangle, Copy, FolderOpen, Pause, Play, Send, UploadCloud } from 'lucide-react';
import type { CameraStatus } from '../cameraApi';
import type { AutoSend } from './useAutoSend';

const button = 'btn-tactile inline-flex min-h-10 items-center gap-1.5 px-3 text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50';

/**
 * Auto-send from folder: the Photo Floor page itself sends the shots EOS Utility saves on this
 * laptop. Nothing to install; the page must stay open while shooting.
 */
export const AutoSendPanel: React.FC<{ autoSend: AutoSend; camera: CameraStatus | null }> = ({ autoSend, camera }) => {
  const { status, folderName, state, problem } = autoSend;
  return (
    <div className="space-y-2 border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-ink">
            <UploadCloud className="size-4 text-gold" aria-hidden="true" /> Auto-send from folder
          </p>
          <p className="m-0 text-[11px] text-neutral-600">
            Sends each finished shot from this laptop's EOS folder. Nothing to install: keep this page open while shooting.
          </p>
        </div>
        <Actions autoSend={autoSend} />
      </div>

      {status === 'insecure' && <BrowserSetting />}
      {status === 'unsupported' && (
        <Line tone="amber">This browser can't open a folder for the page. Use Google Chrome or Microsoft Edge on this laptop.</Line>
      )}
      {status === 'other-tab' && (
        <Line tone="amber">Auto-send is already running in another tab of this browser. Use that tab, or close it and press Resume here.</Line>
      )}
      {status === 'needs-permission' && (
        <Line tone="amber">The browser wants a click before the page may read <strong>{folderName}</strong> again. Press Resume.</Line>
      )}
      {status === 'running' && <Running camera={camera} folderName={folderName} state={state} onSendHeld={autoSend.sendHeld} />}
      {problem && <Line tone="red">{problem}</Line>}
    </div>
  );
};

function Actions({ autoSend }: { autoSend: AutoSend }) {
  const { status, folderName } = autoSend;
  if (status === 'running') {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void autoSend.choose()} className={`${button} border border-line text-ink`}>
          <FolderOpen className="size-3.5" aria-hidden="true" /> Change folder
        </button>
        <button type="button" onClick={autoSend.stop} className={`${button} border border-red-500 text-red-700`}>
          <Pause className="size-3.5" aria-hidden="true" /> Stop
        </button>
      </div>
    );
  }
  if (status === 'off' || status === 'needs-permission' || status === 'other-tab') {
    return (
      <div className="flex flex-wrap gap-2">
        {folderName && (
          <button type="button" onClick={() => void autoSend.resume()} className={`${button} bg-gold text-on-gold`}>
            <Play className="size-3.5" aria-hidden="true" /> {status === 'off' ? `Start from ${folderName}` : 'Resume'}
          </button>
        )}
        <button type="button" onClick={() => void autoSend.choose()}
          className={`${button} ${folderName ? 'border border-gold text-gold' : 'bg-gold text-on-gold'}`}>
          <FolderOpen className="size-3.5" aria-hidden="true" /> {folderName ? 'Choose another folder' : 'Choose EOS folder'}
        </button>
      </div>
    );
  }
  return null;
}

function Running({ camera, folderName, state, onSendHeld }: {
  camera: CameraStatus | null; folderName: string; state: AutoSend['state']; onSendHeld: () => void;
}) {
  if (!camera) return <Line tone="amber">Choose this device's camera above, so the page knows where to send the shots.</Line>;
  if (!camera.enabled) return <Line tone="amber">This camera is turned off. Shots wait on this laptop.</Line>;
  const client = camera.client;
  const sentAt = state?.lastSentAt ? new Date(state.lastSentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : null;
  return (
    <div className="space-y-2">
      <p role="status" className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink">
        <span className={`inline-block size-2 shrink-0 rounded-full ${state?.phase === 'offline' || state?.phase === 'refused' || state?.phase === 'paused'
          ? 'bg-red-500' : 'bg-emerald-500 motion-safe:animate-status-pulse'}`} aria-hidden="true" />
        <strong>Sending from {folderName}</strong>
        <span className="text-neutral-600">
          {sentAt === null ? 'no shot sent yet' : `last shot at ${sentAt}${state?.lastSentName ? ` (${state.lastSentName})` : ''}`}
          {` · ${state?.sent ?? 0} sent`}
          {state?.waiting ? ` · ${state.waiting} waiting` : ''}
        </span>
      </p>
      {state?.phase === 'no-client' && (
        <Line tone="amber">No client is linked to {camera.name}. Shots wait on this laptop until you Call or Select a client.</Line>
      )}
      {state?.error && <Line tone="red">{state.error}</Line>}
      {!!state?.held && client && (
        <Line tone="amber">
          <span>
            {state.held} shot{state.held === 1 ? ' was' : 's were'} taken before {client.name} was linked, so {state.held === 1 ? 'it waits' : 'they wait'} on this laptop.
          </span>
          <button type="button" onClick={onSendHeld} className={`${button} mt-2 bg-gold text-on-gold sm:mt-0 sm:ml-3`}>
            <Send className="size-3" aria-hidden="true" /> Send them to {client.name.split(' ')[0]}
          </button>
        </Line>
      )}
      {!!state?.stuck && (
        <Line tone="amber">
          {state.stuck} sent shot{state.stuck === 1 ? ' is' : 's are'} still open in another program on this laptop. {state.stuck === 1 ? 'It is' : 'They are'} deleted here once closed (never sent twice).
        </Line>
      )}
      {!!state?.rejected.length && (
        <Line tone="red">
          <span>
            Not sent (left on this laptop): {state.rejected.slice(0, 3).map((item) => `${item.name}: ${item.reason}`).join(' · ')}
            {state.rejected.length > 3 ? ` · and ${state.rejected.length - 3} more` : ''}
          </span>
        </Line>
      )}
    </div>
  );
}

/** Chrome and Edge allow folder access only on secure pages; StudioFlow runs on plain http on the LAN. */
function BrowserSetting() {
  const origin = window.location.origin;
  const [copied, setCopied] = useState('');
  // navigator.clipboard is off on plain http pages too, so copy through a hidden text box.
  const copy = async (text: string) => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(text);
      else {
        const box = document.createElement('textarea');
        box.value = text;
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        const done = document.execCommand('copy');
        box.remove();
        if (!done) throw new Error('copy refused');
      }
      setCopied(text);
    } catch {
      setCopied('');
    }
  };
  const flag = navigator.userAgent.includes('Edg/') ? 'edge://flags/#unsafely-treat-insecure-origin-as-secure'
    : 'chrome://flags/#unsafely-treat-insecure-origin-as-secure';
  return (
    <div role="status" className="space-y-2 border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="m-0 font-bold">This browser needs one setting first (once per laptop, nothing to install):</p>
      <ol className="m-0 list-decimal space-y-1.5 pl-5">
        <li>
          Open a new tab and paste this address:{' '}
          <CopyText text={flag} copied={copied === flag} onCopy={() => void copy(flag)} />
        </li>
        <li>
          In the box under <em>Insecure origins treated as secure</em>, paste:{' '}
          <CopyText text={origin} copied={copied === origin} onCopy={() => void copy(origin)} />
        </li>
        <li>Set it to <strong>Enabled</strong>, press <strong>Relaunch</strong>, then come back to this page.</li>
      </ol>
    </div>
  );
}

function CopyText({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 align-middle">
      <code className="break-all select-all border border-amber-400 bg-canvas px-1.5 py-0.5 font-mono text-xs font-bold text-ink">{text}</code>
      <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 px-1 text-[10px] font-black uppercase text-amber-900 underline cursor-pointer">
        <Copy className="size-3" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function Line({ tone, children }: { tone: 'amber' | 'red'; children: React.ReactNode }) {
  return (
    <div role={tone === 'red' ? 'alert' : 'status'}
      className={`flex flex-col gap-2 border p-2.5 text-xs sm:flex-row sm:items-center ${tone === 'red'
        ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-1 flex-col sm:flex-row sm:items-center">{children}</div>
    </div>
  );
}
