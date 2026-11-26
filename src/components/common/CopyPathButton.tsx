import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { workflowError } from '../../hooks/useWorkflowData';
import { copyFolderPathToClipboard, getPhotoFolderPath } from '../../utils/folderPath';

/** Copies the client's photo folder path; shows it in a field when the clipboard isn't available. */
export function CopyPathButton({ registrationId, className = '' }: { registrationId: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const { toast } = useToast();
  const copy = async () => {
    try {
      const path = await getPhotoFolderPath(registrationId);
      if (await copyFolderPathToClipboard(path)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setFolderPath(path);
      }
    } catch (error) {
      toast.error(workflowError(error));
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className={`btn-tactile inline-flex items-center gap-1 px-2 py-0.5 font-bold uppercase shrink-0 whitespace-nowrap bg-obsidian text-gold hover:bg-neutral-800 cursor-pointer ${className}`}
      >
        {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
        <span>{copied ? 'Copied' : 'Copy Path'}</span>
      </button>
      {folderPath && (
        <input type="text" aria-label="Pictorial folder path" value={folderPath} readOnly
          onFocus={(event) => event.target.select()} className="mt-2 w-full bg-panel text-ink border border-neutral-400 p-1 font-mono text-xs" />
      )}
    </>
  );
}
