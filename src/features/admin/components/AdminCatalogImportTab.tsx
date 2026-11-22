import React, { useEffect, useRef, useState } from 'react';
import {
  FileImage, FileSpreadsheet, FileText, Loader2, Plus, RefreshCw, Trash2, UploadCloud, Download,
  ArrowLeftRight, AlertTriangle, CheckCircle2, ScanText, Gift, DatabaseBackup, X,
} from 'lucide-react';
import type { AddOn, Package, RevenueCategory } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { useToast } from '../../../context/ToastContext';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { RecordActionButton } from '../../../components/common/RecordActionButton';
import { PackageInclusionsEditor } from './PackageInclusionsEditor';
import { PackageOptionGroupsEditor } from './PackageOptionGroupsEditor';
import { PhotoLimitInput } from './PhotoLimitInput';
import { InclusionTreeEditor } from './InclusionTreeEditor';
import { cleanInclusionTree, countInclusionItems, inclusionLines } from '../../../utils/inclusions';
import { COMMON_FREEBIE_PRESETS } from '../catalogPresets';
import type { PackageKind } from '../useAdminData';
import {
  assignCodes, lineKey, newDraftAddOn, newDraftPackage, parseCatalogJson, parseCatalogText,
  type CatalogDraft, type DraftAddOn, type DraftPackage,
} from '../catalogImport/catalogParser';
import {
  ACCEPTED_FILES, downloadCatalogTemplate, readCatalogSource, sourceKind, type SourceKind,
} from '../catalogImport/readCatalogSource';
import type { CatalogSaveResult } from '../catalogImport/saveCatalog';
import type { CatalogBackup, RestoreResult } from '../catalogBackup';

interface AdminCatalogImportTabProps {
  packages: Package[];
  addOns: AddOn[];
  onSave: (packages: DraftPackage[], addOns: DraftAddOn[]) => Promise<CatalogSaveResult>;
  /** Restores the catalog copy inside an exported price list. */
  onRestore: (backup: CatalogBackup, update: boolean, onProgress?: (label: string, fraction: number) => void) => Promise<RestoreResult>;
  onOpenCatalog: () => void;
}

interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  text: string;
  previewUrl?: string;
  error?: string;
}

type PackageRow = DraftPackage & { sourceId: string };
type AddOnRow = DraftAddOn & { sourceId: string };

const MANUAL = 'manual';
const KIND_ICONS = { image: FileImage, sheet: FileSpreadsheet, doc: FileText, text: FileText, json: FileText } as const;
const KIND_LABELS = { image: 'Photo', sheet: 'Spreadsheet', doc: 'Word document', text: 'Text file', json: 'StudioFlow package file' } as const;

export const AdminCatalogImportTab: React.FC<AdminCatalogImportTabProps> = ({ packages, addOns, onSave, onRestore, onOpenCatalog }) => {
  const { toast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [packageRows, setPackageRows] = useState<PackageRow[]>([]);
  const [addOnRows, setAddOnRows] = useState<AddOnRow[]>([]);
  const [progress, setProgress] = useState<{ label: string; fraction: number; file: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef<string[]>([]);
  const savingRef = useRef(false);
  // An exported price list carries a catalog backup: offer to restore it instead of reading it as a flyer.
  const [backupFile, setBackupFile] = useState<{ name: string; backup: CatalogBackup } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [restoring, setRestoring] = useState<{ label: string; fraction: number } | null>(null);
  const [restored, setRestored] = useState<RestoreResult | null>(null);
  const runRestore = async () => {
    if (!backupFile || restoring) return;
    setRestoring({ label: 'Starting', fraction: 0 });
    try {
      const result = await onRestore(backupFile.backup, updateExisting, (label, fraction) => setRestoring({ label, fraction }));
      setRestored(result);
      if (result.failed.length) toast.warning(`Restored with ${result.failed.length} problem(s). See the list below.`);
      else toast.success(`Catalog restored: ${result.created} added, ${result.updated} updated, ${result.kept} already there.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The catalog could not be restored.');
    } finally {
      setRestoring(null);
    }
  };

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const existingPackage = (name: string) => packages.find((p) => lineKey(p.name) === lineKey(name));
  const existingAddOn = (name: string) => addOns.find((a) => lineKey(a.name) === lineKey(name));

  /** Gives new drafts unique codes and leaves out (unticks) ones already in the catalog. */
  const prepare = (draft: CatalogDraft, sourceId: string, currentPackages: PackageRow[], currentAddOns: AddOnRow[]) => {
    const coded = assignCodes(
      draft,
      [...packages.map((p) => p.code), ...currentPackages.map((p) => p.code)],
      [...addOns.flatMap((a) => (a.code ? [a.code] : [])), ...currentAddOns.map((a) => a.code)],
    );
    return {
      packages: coded.packages.map((p) => ({ ...p, sourceId, include: p.include && !existingPackage(p.name) })),
      addOns: coded.addOns.map((a) => ({ ...a, sourceId, include: a.include && !existingAddOn(a.name) })),
    };
  };

  const applyDraft = (draft: CatalogDraft, sourceId: string) => {
    const keptPackages = packageRows.filter((p) => p.sourceId !== sourceId);
    const keptAddOns = addOnRows.filter((a) => a.sourceId !== sourceId);
    const fresh = prepare(draft, sourceId, keptPackages, keptAddOns);
    setPackageRows([...keptPackages, ...fresh.packages]);
    setAddOnRows([...keptAddOns, ...fresh.addOns]);
    return fresh;
  };

  const addFiles = async (files: File[]) => {
    if (progress || !files.length) return;
    let currentPackages = packageRows;
    let currentAddOns = addOnRows;
    for (const file of files) {
      const id = `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const kind = sourceKind(file) ?? 'text';
      let previewUrl: string | undefined;
      if (kind === 'image') {
        previewUrl = URL.createObjectURL(file);
        previewUrls.current.push(previewUrl);
      }
      setProgress({ label: 'Opening', fraction: 0, file: file.name });
      // An exported StudioFlow price list: restore it exactly instead of reading it as text.
      const backup = await (await import('../catalogBackup')).findBackupInFile(file);
      if (backup) {
        setBackupFile({ name: file.name, backup });
        setRestored(null);
        toast.success(`${file.name} is a StudioFlow catalog backup. Check the summary and press Restore.`);
        continue;
      }
      try {
        const result = await readCatalogSource(file, (label, fraction) => setProgress({ label, fraction, file: file.name }));
        const fresh = prepare(result.draft, id, currentPackages, currentAddOns);
        currentPackages = [...currentPackages, ...fresh.packages];
        currentAddOns = [...currentAddOns, ...fresh.addOns];
        setPackageRows(currentPackages);
        setAddOnRows(currentAddOns);
        setSources((list) => [...list, { id, name: file.name, kind: result.kind, text: result.text, previewUrl }]);
        const found = fresh.packages.length + fresh.addOns.length;
        if (found) toast.success(`Found ${fresh.packages.length} package(s) and ${fresh.addOns.length} add-on(s) in ${file.name}. Check them below before saving.`);
        else toast.warning(`Nothing priced was found in ${file.name}. Correct the text it read and press "Read again", or add items by hand.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The file could not be read.';
        setSources((list) => [...list, { id, name: file.name, kind, text: '', previewUrl, error: message }]);
        toast.error(message);
      }
    }
    setProgress(null);
  };

  // A screenshot pasted while this tab is open (Ctrl+V) is read like an uploaded photo.
  const addFilesRef = useRef(addFiles);
  useEffect(() => { addFilesRef.current = addFiles; });
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        event.preventDefault();
        void addFilesRef.current(files.map((f, i) => new File([f], f.name || `Pasted image ${i + 1}.png`, { type: f.type })));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const rereadSource = (source: Source) => {
    let draft: CatalogDraft;
    try {
      draft = source.kind === 'json' ? parseCatalogJson(source.text) : parseCatalogText(source.text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The text could not be read.');
      return;
    }
    const fresh = applyDraft(draft, source.id);
    toast.info(`Read again: ${fresh.packages.length} package(s), ${fresh.addOns.length} add-on(s).`);
  };

  const removeSource = (id: string) => {
    setSources((list) => list.filter((s) => s.id !== id));
    setPackageRows((rows) => rows.filter((p) => p.sourceId !== id));
    setAddOnRows((rows) => rows.filter((a) => a.sourceId !== id));
  };

  const updatePackage = (key: string, patch: Partial<DraftPackage>) =>
    setPackageRows((rows) => rows.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const updateAddOn = (key: string, patch: Partial<DraftAddOn>) =>
    setAddOnRows((rows) => rows.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const packageToAddOn = (row: PackageRow) => {
    setPackageRows((rows) => rows.filter((p) => p.key !== row.key));
    const coded = prepare({ packages: [], addOns: [newDraftAddOn({ name: row.name, amount: row.amount, revenue: row.revenue })] },
      row.sourceId, packageRows, addOnRows).addOns;
    setAddOnRows((rows) => [...rows, ...coded]);
  };
  const addOnToPackage = (row: AddOnRow) => {
    setAddOnRows((rows) => rows.filter((a) => a.key !== row.key));
    const coded = prepare({ packages: [newDraftPackage({ name: row.name, amount: row.amount, revenue: row.revenue })], addOns: [] },
      row.sourceId, packageRows, addOnRows).packages;
    setPackageRows((rows) => [...rows, ...coded]);
  };

  // ---------- Saving ----------

  const chosenPackages = packageRows.filter((p) => p.include);
  const chosenAddOns = addOnRows.filter((a) => a.include);

  const problemsFor = (row: PackageRow | AddOnRow, type: 'package' | 'addon'): string[] => {
    const problems: string[] = [];
    // Adding to an existing package: only its lists change, so name, price and code don't apply.
    if (type === 'package' && (row as PackageRow).mergeInto) {
      const pkg = row as PackageRow;
      if (!countInclusionItems(cleanInclusionTree(pkg.inclusions)) && !pkg.freebies.some((f) => f.trim()) && !pkg.optionGroups.length) {
        problems.push('Add an inclusion, freebie or option to add to the package.');
      }
      return problems;
    }
    if (!row.name.trim()) problems.push('Enter a name.');
    if (!Number.isFinite(row.amount) || row.amount < 0) problems.push('Enter a price of zero or more.');
    if (!row.code.trim()) problems.push('Enter a code.');
    const code = row.code.trim().toUpperCase();
    const taken = type === 'package'
      ? packages.some((p) => p.code.toUpperCase() === code) || chosenPackages.some((p) => p.key !== row.key && p.code.trim().toUpperCase() === code)
      : addOns.some((a) => (a.code || '').toUpperCase() === code) || chosenAddOns.some((a) => a.key !== row.key && a.code.trim().toUpperCase() === code);
    if (code && taken) problems.push(`Code ${code} is already used.`);
    return problems;
  };

  const blocking = [
    ...chosenPackages.flatMap((p) => problemsFor(p, 'package')),
    ...chosenAddOns.flatMap((a) => problemsFor(a, 'addon')),
  ];
  const zeroPriced = [...chosenPackages.filter((p) => !p.mergeInto), ...chosenAddOns].filter((r) => r.amount === 0).length;
  const mergeCount = chosenPackages.filter((p) => p.mergeInto).length;
  const newPackageCount = chosenPackages.length - mergeCount;

  const save = async () => {
    // One save at a time, even if Save is clicked twice before the screen updates.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const sent = new Set([...chosenPackages, ...chosenAddOns].map((row) => row.key));
    try {
      const { created, updated, failed } = await onSave(chosenPackages, chosenAddOns);
      // Saved drafts leave the list; failed ones stay (still ticked) so they can be fixed and saved again.
      const failedKeys = new Set(failed.map((f) => f.key));
      const keep = (row: { key: string }) => !sent.has(row.key) || failedKeys.has(row.key);
      setPackageRows((rows) => rows.filter(keep));
      setAddOnRows((rows) => rows.filter(keep));
      if (created) toast.success(`${created} item(s) saved and active. The kiosk and cashier can use them now.`, 'Catalog updated');
      if (updated) toast.success(`${updated} existing package(s) updated with the new inclusions and freebies.`, 'Catalog updated');
      failed.forEach((f) => toast.error(`${f.name}: ${f.message}`, 'Not saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The catalog could not be saved.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const busy = !!progress || saving;

  const b = backupFile?.backup;
  return (
    <div className="space-y-6 animate-enter font-mono text-xs">
      {backupFile && b && (
        <div className="bg-panel border-2 border-gold shadow-lux-gold p-5 space-y-3">
          <div className="flex items-start justify-between gap-3 pb-2 border-b-2 border-line">
            <div>
              <h3 className="flex items-center gap-2 text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
                <DatabaseBackup className="w-4 h-4 text-gold" /> Restore catalog from backup
              </h3>
              <p className="mt-1 font-sans text-xs text-neutral-600">
                <b>{backupFile.name}</b> is a StudioFlow price list exported {new Date(b.exported_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}.
                It holds an exact copy of the catalog.
              </p>
            </div>
            <button type="button" aria-label="Close" disabled={!!restoring} onClick={() => { setBackupFile(null); setRestored(null); }}
              className="w-8 h-8 flex items-center justify-center border border-line bg-canvas cursor-pointer disabled:opacity-50"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([['Single items', b.items.length], ['Saved poses', b.poses.length], ['Packages', b.packages.length], ['Add-ons', b.add_ons.length]] as const).map(([label, n]) => (
              <div key={label} className="p-2 border border-gold/50 bg-gold-wash text-center">
                <div className="text-lg font-black text-ink">{n}</div>
                <div className="text-[9px] font-black uppercase tracking-wider text-neutral-600">{label}</div>
              </div>
            ))}
          </div>
          <ul className="font-sans text-xs text-neutral-700 list-disc list-inside space-y-0.5">
            <li>Restores prices, kiosk settings, attires and backgrounds, poses, exchanges, freebie choices and add-ons exactly as exported.</li>
            <li>Anything already in the system (same code or name) is kept as it is{updateExisting ? ', then changed to match the backup' : ''}.</li>
            <li>Package photos are not in the file: add them again in each package's Photos step.</li>
          </ul>
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" className="size-4 accent-gold" checked={updateExisting} disabled={!!restoring} onChange={(e) => setUpdateExisting(e.target.checked)} />
            Also change existing items and packages to match the backup
          </label>
          {restoring && (
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase text-neutral-600">Restoring {restoring.label}… {Math.round(restoring.fraction * 100)}%</div>
              <div className="h-1.5 bg-canvas border border-line"><div className="h-full bg-gold transition-all" style={{ width: `${Math.round(restoring.fraction * 100)}%` }} /></div>
            </div>
          )}
          {restored && (
            <div role="status" className={`p-2 border font-sans text-xs space-y-1 ${restored.failed.length ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-emerald-500 bg-emerald-50 text-emerald-800'}`}>
              <p className="font-bold">Added {restored.created} · updated {restored.updated} · already there {restored.kept}{restored.failed.length ? ` · ${restored.failed.length} not restored` : ''}</p>
              {restored.failed.map((f, i) => <p key={i}>{f.what} "{f.name}": {f.message}</p>)}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {restored && (
              <button type="button" onClick={onOpenCatalog}
                className="btn-tactile min-h-[40px] px-4 border border-line bg-canvas font-black uppercase cursor-pointer">Open the catalog</button>
            )}
            <button type="button" disabled={!!restoring} onClick={() => void runRestore()}
              className="btn-tactile min-h-[40px] px-5 flex items-center gap-1.5 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer disabled:opacity-50">
              {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />} {restored ? 'Restore again' : 'Restore'}
            </button>
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b-2 border-line">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink flex items-center gap-2">
              <ScanText className="w-4 h-4 text-gold" /> Import Packages &amp; Add-ons
            </h3>
            <p className="mt-1 font-sans text-xs text-neutral-600 max-w-2xl">
              Upload a package flyer photo, an Excel price list or a Word document. StudioFlow reads the
              package names, prices, inclusions, freebies, options and add-ons for you to check. Nothing is saved until you
              press Save. Files are read on this computer and never sent to the internet. A price list exported from
              StudioFlow (Excel, CSV or Word) restores the whole catalog exactly.
            </p>
          </div>
          <button type="button" onClick={() => void downloadCatalogTemplate()}
            className="btn-tactile flex items-center gap-1.5 px-3 py-2 bg-canvas border border-line font-black uppercase text-[10px] cursor-pointer">
            <Download className="w-3.5 h-3.5" /> Excel template
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
          className={`w-full flex flex-col items-center justify-center gap-2 px-4 py-10 border-2 border-dashed cursor-pointer transition-colors disabled:cursor-wait ${
            dragging ? 'border-gold bg-gold-wash' : 'border-neutral-400 bg-canvas hover:border-line'
          }`}
        >
          {progress ? (
            <>
              <Loader2 className="w-7 h-7 text-gold animate-spin" />
              <span className="font-black uppercase text-ink">{progress.label}…</span>
              <span className="text-[10px] text-neutral-500">{progress.file}</span>
              <div className="w-full max-w-sm h-2 bg-neutral-200 border border-neutral-300">
                <div className="h-full bg-gold transition-all" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
              <span className="text-[10px] text-neutral-500">Reading a photo can take up to a minute.</span>
            </>
          ) : (
            <>
              <UploadCloud className="w-8 h-8 text-gold" />
              <span className="font-black uppercase tracking-wider text-ink">Drop files here or click to choose</span>
              <span className="text-[11px] text-neutral-600 font-sans">
                Photos (JPG, PNG) · Excel (.xlsx, .csv) · Word (.docx) · Text (.txt) · StudioFlow package (.json). You can also paste a screenshot (Ctrl+V).
              </span>
            </>
          )}
        </button>
        <input ref={fileInput} type="file" multiple accept={ACCEPTED_FILES} className="hidden"
          onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />

        <p className="font-sans text-[11px] text-neutral-600">
          Tip: for photos, take a straight, well-lit shot of the flyer that fills the frame. Fancy script lettering
          may be missed. Fix it in the text below and press <b>Read again</b>.
        </p>
      </div>

      {/* What was read from each file */}
      {sources.length > 0 && (
        <div className="space-y-3">
          {sources.map((source) => {
            const Icon = KIND_ICONS[source.kind];
            const count = packageRows.filter((p) => p.sourceId === source.id).length
              + addOnRows.filter((a) => a.sourceId === source.id).length;
            return (
              <div key={source.id} className="bg-panel border-2 border-line shadow-lux p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-gold shrink-0" />
                    <span className="font-black text-ink truncate">{source.name}</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase border border-neutral-400">{KIND_LABELS[source.kind]}</span>
                    {!source.error && <span className="text-[10px] text-neutral-500">{count} item(s) found</span>}
                  </div>
                  <button type="button" onClick={() => removeSource(source.id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase text-red-600 border border-neutral-300 hover:border-red-600 cursor-pointer">
                    <Trash2 className="w-3 h-3" /> Remove file
                  </button>
                </div>
                {source.error ? (
                  <p className="flex items-center gap-2 p-2 border border-red-400 bg-red-50 text-red-800 font-sans">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {source.error}
                  </p>
                ) : (
                  <div className={`grid gap-3 ${source.previewUrl ? 'md:grid-cols-[220px_1fr]' : ''}`}>
                    {source.previewUrl && (
                      <a href={source.previewUrl} target="_blank" rel="noreferrer" title="Open full size">
                        <img src={source.previewUrl} alt={source.name} className="w-full max-h-72 object-contain border border-neutral-300 bg-canvas" />
                      </a>
                    )}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black uppercase text-neutral-600" htmlFor={`text-${source.id}`}>
                        Text read from the file (edit to correct, then read again)
                      </label>
                      <textarea id={`text-${source.id}`} value={source.text} rows={8}
                        onChange={(e) => setSources((list) => list.map((s) => (s.id === source.id ? { ...s, text: e.target.value } : s)))}
                        className="w-full flex-1 p-2 border border-neutral-400 bg-canvas font-mono text-[11px] leading-relaxed" />
                      <button type="button" onClick={() => rereadSource(source)} disabled={busy}
                        className="btn-tactile self-start flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold border border-line font-black uppercase text-[10px] cursor-pointer disabled:opacity-50">
                        <RefreshCw className="w-3.5 h-3.5" /> Read again
                      </button>
                      {source.kind === 'sheet' && (
                        <p className="text-[10px] text-neutral-500 font-sans">
                          Read again uses this text, not the spreadsheet's columns. To start over from the columns, remove the file and upload it again.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review: packages */}
      {(sources.length > 0 || packageRows.length > 0 || addOnRows.length > 0) && (
        <div className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-line">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">Review Packages</h3>
            <button type="button"
              onClick={() => setPackageRows((rows) => [...rows, ...prepare({ packages: [newDraftPackage({ name: 'New Package' })], addOns: [] }, MANUAL, rows, addOnRows).packages])}
              className="btn-tactile flex items-center gap-1 px-3 py-1.5 bg-canvas border border-line font-black uppercase text-[10px] cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add package
            </button>
          </div>
          {packageRows.length === 0 && (
            <p className="p-4 text-center border border-dashed border-neutral-300 text-neutral-500 font-sans italic">No packages found.</p>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {packageRows.map((row) => {
              const target = row.mergeInto ? packages.find((p) => p.id === row.mergeInto) : undefined;
              const duplicate = target ? undefined : existingPackage(row.name);
              const problems = row.include ? problemsFor(row, 'package') : [];
              return (
                <div key={row.key} className={`p-4 border-2 space-y-3 ${row.include ? 'border-line bg-panel' : 'border-neutral-300 bg-canvas opacity-70'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-black uppercase text-[11px] cursor-pointer">
                      <input type="checkbox" className="size-4 accent-gold" checked={row.include}
                        onChange={(e) => updatePackage(row.key, { include: e.target.checked })} />
                      Save this package
                    </label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => packageToAddOn(row)} title="This is really an add-on"
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-300 hover:border-line cursor-pointer">
                        <ArrowLeftRight className="w-3 h-3" /> Make add-on
                      </button>
                      <RecordActionButton variant="delete" recordName={row.name.trim() || 'draft package'}
                        onClick={() => setPackageRows((rows) => rows.filter((p) => p.key !== row.key))} />
                    </div>
                  </div>
                  <Field label="Save as">
                    <select value={row.mergeInto ?? ''}
                      onChange={(e) => updatePackage(row.key, { mergeInto: e.target.value || undefined, include: true })}
                      className="w-full min-h-[38px] p-2 border border-neutral-400 bg-canvas font-bold">
                      <option value="">New package</option>
                      {packages.length > 0 && (
                        <optgroup label="Add to an existing package">
                          {packages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} · {p.name} ({formatCurrency(p.amount)}){p.is_active === false ? ' (archived)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>
                  {target && (
                    <p className="flex items-start gap-1.5 p-2 border border-gold bg-gold-wash text-ink font-sans text-[11px]">
                      <Gift className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gold" />
                      <span>
                        The inclusions, freebies and options below are added to <b>{target.name}</b> ({target.code}), skipping any it already has.
                        Its name, price and code stay the same. Job orders already sold keep what they were sold with.
                      </span>
                    </p>
                  )}
                  {duplicate && (
                    <p className="flex items-center gap-1.5 p-2 border border-amber-400 bg-amber-50 text-amber-900 font-sans text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      The catalog already has "{duplicate.name}" ({duplicate.code}, {formatCurrency(duplicate.amount)}). Tick it only to add a second one,
                      or choose it under Save as to add these items to it.
                    </p>
                  )}
                  {!target && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Field label="Name" className="col-span-2">
                      <input value={row.name} onChange={(e) => updatePackage(row.key, { name: e.target.value })}
                        className="w-full p-2 border border-neutral-400 bg-canvas font-semibold" />
                    </Field>
                    <Field label="Code">
                      <input value={row.code} onChange={(e) => updatePackage(row.key, { code: e.target.value.toUpperCase() })}
                        className="w-full p-2 border border-neutral-400 bg-canvas uppercase font-bold" />
                    </Field>
                    <Field label="Price (₱)">
                      <input type="number" min="0" step="0.01" value={row.amount}
                        onChange={(e) => updatePackage(row.key, { amount: Number(e.target.value) })}
                        className="w-full p-2 border border-neutral-400 bg-canvas font-black" />
                    </Field>
                    <Field label="Offered to">
                      <KindSelect value={row.clientKind} onChange={(clientKind) => updatePackage(row.key, { clientKind })} />
                    </Field>
                    <Field label="Revenue">
                      <RevenueSelect value={row.revenue} onChange={(revenue) => updatePackage(row.key, { revenue })} />
                    </Field>
                    <div className="col-span-2 sm:col-span-4">
                      <PhotoLimitInput value={row.photoLimit} onChange={(photoLimit) => updatePackage(row.key, { photoLimit })} />
                    </div>
                  </div>}
                  <InclusionTreeEditor inclusions={row.inclusions}
                    onChange={(inclusions) => updatePackage(row.key, { inclusions })} label="Inclusions" />
                  <PackageInclusionsEditor inclusions={row.freebies} presets={COMMON_FREEBIE_PRESETS} itemName="freebie"
                    onChange={(freebies) => updatePackage(row.key, { freebies })} label="Freebies" />
                  <PackageOptionGroupsEditor groups={row.optionGroups} inclusionLabels={inclusionLines(row.inclusions)}
                    onChange={(optionGroups) => updatePackage(row.key, { optionGroups })} />
                  <Problems problems={problems} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review: add-ons */}
      {(sources.length > 0 || packageRows.length > 0 || addOnRows.length > 0) && (
        <div className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b-2 border-line">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">Review Add-ons</h3>
            <button type="button"
              onClick={() => setAddOnRows((rows) => [...rows, ...prepare({ packages: [], addOns: [newDraftAddOn({ name: 'New Add-on' })] }, MANUAL, packageRows, rows).addOns])}
              className="btn-tactile flex items-center gap-1 px-3 py-1.5 bg-canvas border border-line font-black uppercase text-[10px] cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add add-on
            </button>
          </div>
          {addOnRows.length === 0 && (
            <p className="p-4 text-center border border-dashed border-neutral-300 text-neutral-500 font-sans italic">
              No add-ons found. Flyers often list them under a heading such as "Add-ons" or "Extras".
            </p>
          )}
          <div className="space-y-2">
            {addOnRows.map((row) => {
              const duplicate = existingAddOn(row.name);
              const problems = row.include ? problemsFor(row, 'addon') : [];
              return (
                <div key={row.key} className={`p-3 border-2 ${row.include ? 'border-line bg-panel' : 'border-neutral-300 bg-canvas opacity-70'}`}>
                  <div className="grid grid-cols-2 md:grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end">
                    <label className="flex items-center gap-2 font-black uppercase text-[10px] cursor-pointer self-center col-span-2 md:col-span-1">
                      <input type="checkbox" className="size-4 accent-gold" checked={row.include}
                        onChange={(e) => updateAddOn(row.key, { include: e.target.checked })} />
                      <span className="md:sr-only">Save this add-on</span>
                    </label>
                    <Field label="Name" className="col-span-2 md:col-span-1">
                      <input value={row.name} onChange={(e) => updateAddOn(row.key, { name: e.target.value })}
                        className="w-full p-2 border border-neutral-400 bg-canvas font-semibold" />
                    </Field>
                    <Field label="Code">
                      <input value={row.code} onChange={(e) => updateAddOn(row.key, { code: e.target.value.toUpperCase() })}
                        className="w-full p-2 border border-neutral-400 bg-canvas uppercase font-bold" />
                    </Field>
                    <Field label="Price (₱)">
                      <input type="number" min="0" step="0.01" value={row.amount}
                        onChange={(e) => updateAddOn(row.key, { amount: Number(e.target.value) })}
                        className="w-full p-2 border border-neutral-400 bg-canvas font-black" />
                    </Field>
                    <Field label="Offered to">
                      <KindSelect value={row.clientKind} onChange={(clientKind) => updateAddOn(row.key, { clientKind })} />
                    </Field>
                    <Field label="Revenue">
                      <RevenueSelect value={row.revenue} onChange={(revenue) => updateAddOn(row.key, { revenue })} />
                    </Field>
                    <div className="col-span-2 flex items-center justify-end gap-2 md:col-span-1">
                      <button type="button" onClick={() => addOnToPackage(row)} title="This is really a package"
                        className="flex items-center gap-1 px-2 py-2 text-[10px] font-bold uppercase border border-neutral-300 hover:border-line cursor-pointer">
                        <ArrowLeftRight className="w-3 h-3" /> Package
                      </button>
                      <RecordActionButton variant="delete" recordName={row.name.trim() || 'draft add-on'}
                        onClick={() => setAddOnRows((rows) => rows.filter((a) => a.key !== row.key))} />
                    </div>
                  </div>
                  {duplicate && (
                    <p className="mt-2 text-[11px] font-sans text-amber-800">
                      Already in the catalog as "{duplicate.name}" ({formatCurrency(duplicate.amount)}).
                    </p>
                  )}
                  <Problems problems={problems} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save */}
      {(packageRows.length > 0 || addOnRows.length > 0) && (
        <div className="bg-panel border-2 border-line shadow-lux p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-4">
          <div className="font-sans text-xs text-neutral-700">
            <b>{newPackageCount}</b> new package(s){mergeCount > 0 && <>, <b>{mergeCount}</b> existing package(s) to update,</>} and <b>{chosenAddOns.length}</b> add-on(s) ticked.
            {blocking.length > 0 && <span className="ml-2 text-red-700 font-bold">Fix {blocking.length} problem(s) first.</span>}
            {zeroPriced > 0 && !blocking.length && <span className="ml-2 text-amber-800 font-bold">{zeroPriced} item(s) priced at ₱0.</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onOpenCatalog}
              className="btn-tactile px-3 py-2 bg-canvas border border-line font-black uppercase text-[10px] cursor-pointer">
              View catalog
            </button>
            <button type="button" disabled={busy || blocking.length > 0 || !(chosenPackages.length + chosenAddOns.length)}
              onClick={() => setConfirming(true)}
              className="btn-tactile flex items-center gap-1.5 px-4 py-2 bg-obsidian text-gold border border-line font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save to catalog
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirming}
        title="Save to catalog"
        message={
          <span>
            Add {newPackageCount} new package(s) and {chosenAddOns.length} add-on(s) to the catalog? They are saved as
            <b> active</b>, so the registration kiosk and cashier can offer them right away. You can edit or archive
            them later under Packages &amp; Add-ons.
            {mergeCount > 0 && (
              <><br /><br />{mergeCount} existing package(s) also get the inclusions, freebies and options you listed; their name,
              price and code stay the same.</>
            )}
            {zeroPriced > 0 && <><br /><br /><b>{zeroPriced} item(s) are priced at ₱0.</b></>}
          </span>
        }
        confirmText="Save"
        onConfirm={save}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
};

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function KindSelect({ value, onChange }: { value: PackageKind; onChange: (value: PackageKind) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as PackageKind)}
      className="w-full min-h-[38px] p-2 border border-neutral-400 bg-canvas font-bold">
      <option value="school">School</option>
      <option value="walkin">Walk-in</option>
      <option value="both">Both</option>
    </select>
  );
}

function RevenueSelect({ value, onChange }: { value: RevenueCategory; onChange: (value: RevenueCategory) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RevenueCategory)}
      className="w-full min-h-[38px] p-2 border border-neutral-400 bg-canvas font-bold">
      <option value="studio">Studio</option>
      <option value="mua">MUA service</option>
    </select>
  );
}

function Problems({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <ul className="mt-2 p-2 border border-red-400 bg-red-50 text-red-800 font-sans text-[11px] list-disc list-inside">
      {problems.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}
