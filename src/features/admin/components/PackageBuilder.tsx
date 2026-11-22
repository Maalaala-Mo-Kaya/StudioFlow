import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Plus, Minus, Trash2, ChevronUp, ChevronDown, Frame, Camera, Layers, ArrowLeftRight, Gift, Eye, Check, X, AlertTriangle,
  Copy, BookmarkPlus, Printer, MonitorSmartphone, ClipboardList, ArrowLeft, ArrowRight, ImagePlus, Images, ChevronLeft, ChevronRight, Star, Loader2,
} from 'lucide-react';
import type {
  CatalogItem, CatalogItemCategory, ExchangeOption, FreebieChoice, ItemPackage, Package, PackageExchange, PackageInclusionRef, PackagePose,
  PackageStructure, PoseRow, RevenueCategory,
} from '../../../types';
import type { PackageBuilderData, PackageKind } from '../useAdminData';
import { useToast } from '../../../context/ToastContext';
import { formatCurrency } from '../../../utils/formatters';
import {
  copyStructure, emptyStructure, makeCatalog, newId, poseFromSaved, poseTitle, printRows, readStructure, renderPackage, rowPrints, rowSummary,
  setSummary, totalPrints, type Catalog,
} from '../../../utils/catalogRender';
import { InclusionTreeView } from '../../../components/common/InclusionTreeView';
import { PhotoLimitInput } from './PhotoLimitInput';
import { ItemSelect } from './ItemPackagesPanel';
import { MuaRequirementInput, PackageKindInput, RevenueInput } from './PackageFormInputs';
import { PackageDetailsModal } from '../../registration/components/PackageDetailsModal';
import { MAX_PACKAGE_PHOTOS, packagePhotoUrls, shrinkPhoto, type PhotoDraft } from '../../../utils/packagePhotos';

interface PackageBuilderProps {
  items: CatalogItem[];
  /** Saved poses: templates copied into the package. */
  sets: ItemPackage[];
  /** Every package, for "Copy from package" and title suggestions. */
  packages: Package[];
  /** The package being edited, or null to create one. */
  pkg: Package | null;
  onSave: (id: string | null, data: PackageBuilderData) => Promise<void>;
  onSaveItem: (id: string | null, data: { name: string; category: CatalogItemCategory }) => Promise<CatalogItem>;
  onSavePose: (id: string | null, data: { name: string; items: ItemPackage['items'] }) => Promise<ItemPackage>;
  onClose: () => void;
}

const FOR_LABELS = { all: 'Everyone', female: 'Girls', male: 'Boys' } as const;
const filledRows = (rows: PoseRow[]) => rows.filter((r) => r.item).map((r) => ({ item: r.item, qty: Math.min(999, Math.max(1, Math.floor(r.qty || 1))) }));

function Card({ icon: Icon, title, hint, aside, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; hint?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="p-3 border border-line bg-canvas space-y-2">
      <h4 className="flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wider text-ink">
        <span className="flex items-center gap-2"><Icon className="w-4 h-4 text-gold" /> {title}</span>
        {aside}
      </h4>
      {hint && <p className="text-[10px] font-sans text-neutral-600">{hint}</p>}
      {children}
    </section>
  );
}

/** − [ 4 ] + : a quantity from 1 to 999. */
function QtyStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const set = (n: number) => onChange(Math.min(999, Math.max(1, Math.floor(n) || 1)));
  return (
    <div className="flex items-stretch shrink-0">
      <button type="button" aria-label="One less" onClick={() => set(value - 1)} disabled={value <= 1}
        className="px-1.5 border border-neutral-400 bg-panel cursor-pointer disabled:opacity-30"><Minus className="w-3 h-3" /></button>
      <input type="number" min={1} max={999} value={value} aria-label="Quantity" onChange={(e) => set(Number(e.target.value))}
        className="w-12 min-h-[34px] border-y border-neutral-400 bg-canvas font-black text-center [appearance:textfield]" />
      <button type="button" aria-label="One more" onClick={() => set(value + 1)} disabled={value >= 999}
        className="px-1.5 border border-neutral-400 bg-panel cursor-pointer disabled:opacity-30"><Plus className="w-3 h-3" /></button>
    </div>
  );
}

/** A pick-to-add dropdown of saved poses (shows their contents, since titles repeat). */
function SavedPoseSelect({ sets, catalog, label, onPick }: { sets: ItemPackage[]; catalog: Catalog; label: string; onPick: (set: ItemPackage) => void }) {
  if (!sets.length) return null;
  return (
    <select value="" aria-label={label}
      onChange={(e) => { const set = sets.find((s) => s.id === e.target.value); if (set) onPick(set); }}
      className="min-w-0 max-w-full min-h-[34px] p-1.5 border border-dashed border-gold/70 bg-panel text-[10px] font-bold uppercase truncate cursor-pointer">
      <option value="">{label}</option>
      {sets.map((s) => <option key={s.id} value={s.id}>{s.name} ({setSummary(s, catalog)})</option>)}
    </select>
  );
}

type Look = { title: string; attire?: string; background?: string };
const selectClass = 'min-h-[36px] p-1.5 border border-neutral-400 bg-canvas font-black uppercase truncate';

const NEW_ATTIRE = '__new';
const CUSTOM_TITLE = '__custom';

/**
 * A pose: its attire (Toga w/ cap…) and background (Colored, B&W) and its rows (size / item ×
 * quantity). A missing attire is created right here; a typed title is the fallback for odd ones.
 * Used for the package's poses and exchange options.
 */
function PoseEditor({ look, rows, items, catalog, titleList, onLook, onRows, onCreateAttire, tools, below, sameAs }: {
  look: Look; rows: PoseRow[]; items: CatalogItem[]; catalog: Catalog; titleList: string;
  onLook: (look: Look) => void; onRows: (rows: PoseRow[]) => void;
  /** An exchange option: it takes the exchanged pose's prints and background, so only the attire is chosen here. */
  sameAs?: { background: string; prints: string };
  /** Creates an attire item and returns its id (null when it could not be created). */
  onCreateAttire: (name: string) => Promise<string | null>;
  tools?: React.ReactNode; below?: React.ReactNode;
}) {
  const prints = rowPrints(rows, catalog);
  const setRow = (index: number, patch: Partial<PoseRow>) => onRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const attires = items.filter((i) => i.category === 'attire');
  const backgrounds = items.filter((i) => i.category === 'background');
  const [naming, setNaming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const custom = !look.attire && naming === null && !!look.title;
  const withAttire = (attire: string, background = look.background) =>
    onLook({ title: poseTitle({ title: '', attire, background }, catalog), attire, background });
  const create = async (name: string) => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const id = await onCreateAttire(name.trim());
      if (id) { withAttire(id); setNaming(null); }
    } finally {
      setCreating(false);
    }
  };
  // A typed title that names an existing attire: link it in one tap.
  const sameAttire = custom ? attires.find((a) => a.name.trim().toLowerCase() === look.title.trim().toLowerCase()) : undefined;

  return (
    <div className="p-2.5 border border-neutral-300 bg-panel space-y-2">
      <div className="flex flex-wrap items-end gap-1.5">
        <label className="flex-1 min-w-[9rem]">
        <span className="block text-[9px] font-black uppercase tracking-wider text-neutral-600 mb-0.5">Attire</span>
        <select value={naming !== null ? NEW_ATTIRE : look.attire || (custom ? CUSTOM_TITLE : '')} aria-label="Attire"
          onChange={(e) => {
            const value = e.target.value;
            if (value === NEW_ATTIRE) { setNaming(custom ? look.title : ''); return; }
            setNaming(null);
            if (value === CUSTOM_TITLE) onLook({ title: look.attire ? poseTitle(look, catalog) : look.title || ' ', background: look.background });
            else if (value) withAttire(value);
            else onLook({ title: '', background: look.background });
          }}
          className={`w-full ${selectClass} ${!look.attire && naming === null && !custom ? 'border-gold' : ''}`}>
          <option value="">Choose attire…</option>
          {attires.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value={NEW_ATTIRE}>+ New attire…</option>
          <option value={CUSTOM_TITLE}>Custom title (no attire)</option>
        </select>
        </label>
        {!custom && !sameAs && (
          <label className="flex-1 min-w-[7rem]">
          <span className="block text-[9px] font-black uppercase tracking-wider text-neutral-600 mb-0.5">Background of these prints</span>
          <select value={look.background ?? ''} aria-label="Background of these prints"
            onChange={(e) => {
              const background = e.target.value || undefined;
              if (look.attire) withAttire(look.attire, background);
              else onLook({ ...look, background });
            }}
            className={`w-full ${selectClass}`}>
            <option value="">No background</option>
            {backgrounds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          </label>
        )}
        {custom && (
          <label className="flex-1 min-w-[9rem]">
          <span className="block text-[9px] font-black uppercase tracking-wider text-neutral-600 mb-0.5">Title</span>
          <input value={look.title.trimStart()} onChange={(e) => onLook({ title: e.target.value || ' ' })} list={titleList} maxLength={120} aria-label="Pose title"
            placeholder="Type the title"
            className="w-full min-h-[36px] px-2 border border-dashed border-neutral-400 bg-canvas font-black uppercase placeholder:normal-case placeholder:font-normal placeholder:italic placeholder:text-neutral-400" />
          </label>
        )}
        <div className="flex gap-1 ml-auto">{tools}</div>
      </div>
      {naming !== null && (
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 border border-dashed border-gold bg-gold-wash">
          <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} maxLength={120} placeholder="New attire, e.g. Toga w/ cap"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create(naming); } if (e.key === 'Escape') setNaming(null); }}
            className="flex-1 min-w-[10rem] min-h-[34px] px-2 border border-neutral-400 bg-canvas font-semibold placeholder:italic placeholder:text-neutral-400" />
          <button type="button" disabled={!naming.trim() || creating} onClick={() => void create(naming)}
            className="px-2.5 min-h-[34px] bg-obsidian text-gold border border-line text-[10px] font-black uppercase cursor-pointer disabled:opacity-50">
            {creating ? 'Creating…' : 'Create attire'}
          </button>
          <button type="button" onClick={() => setNaming(null)} className="px-2 min-h-[34px] border border-neutral-400 text-[10px] font-bold uppercase cursor-pointer">Cancel</button>
        </div>
      )}
      {custom && (
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-sans text-neutral-600">
          A typed title has no background.
          {sameAttire
            ? <button type="button" onClick={() => withAttire(sameAttire.id)} className="px-1.5 py-0.5 border border-gold text-gold-soft font-black uppercase cursor-pointer">Use attire “{sameAttire.name}”</button>
            : <button type="button" disabled={creating || !look.title.trim()} onClick={() => void create(look.title)}
                className="px-1.5 py-0.5 border border-gold text-gold-soft font-black uppercase cursor-pointer disabled:opacity-50">Make “{look.title.trim()}” an attire</button>}
          to choose its background.
        </p>
      )}
      {sameAs && (
        <p className="text-[11px] font-sans text-neutral-700">
          Same as the exchanged pose: <b>{sameAs.prints}</b>{sameAs.background && <> on <b>{sameAs.background}</b></>}. Only the attire changes.
        </p>
      )}
      {!sameAs && (<>
      <div className="space-y-1">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <QtyStepper value={row.qty} onChange={(qty) => setRow(index, { qty })} />
            <span className="w-7 shrink-0 text-[10px] text-neutral-500">{row.qty === 1 ? 'pc' : 'pcs'}</span>
            <div className="flex-1 min-w-0">
              <ItemSelect items={items} value={row.item} onChange={(item) => setRow(index, { item })} placeholder="Choose a size or item…" only={['print', 'other']} />
            </div>
            <button type="button" title="Remove row" onClick={() => onRows(rows.filter((_, i) => i !== index))}
              className="p-1.5 text-neutral-500 hover:text-red-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onRows([...rows, { item: '', qty: 1 }])}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
          <Plus className="w-3 h-3" /> Size / item
        </button>
        <span className="text-[10px] font-bold text-gold-soft">{prints ? `${prints} ${prints === 1 ? 'print' : 'prints'}` : 'No prints: shows as a plain line'}</span>
      </div>
      </>)}
      {below}
    </div>
  );
}

const iconButton = 'p-1.5 border border-neutral-300 hover:border-line cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

/** The builder's steps, one screen each, in the order a flyer is read. */
const STEPS = [
  { id: 'details', label: 'Details', hint: 'Name, price, who it is for', icon: ClipboardList },
  { id: 'photos', label: 'Photos', hint: 'Flyer and sample shots', icon: Images },
  { id: 'prints', label: 'Frame & poses', hint: 'Frame, attires, prints', icon: Layers },
  { id: 'shoot', label: 'Shoot & exchange', hint: 'Shots, options', icon: Camera },
  { id: 'freebies', label: 'Freebies', hint: 'Free extras', icon: Gift },
] as const;
type StepId = (typeof STEPS)[number]['id'];

/** One freebie: its name, whether the client chooses a version of it, and those choices. */
function FreebieRow({ name, choice, onChoice, onRemove, onUp, onDown }: {
  name: string; choice: FreebieChoice | undefined; onChoice: (choice: FreebieChoice | undefined) => void; onRemove: () => void;
  /** Move it up / down the list (the order clients see); undefined at the ends. */
  onUp?: () => void; onDown?: () => void;
}) {
  const [label, setLabel] = useState('');
  const add = () => {
    const clean = label.trim();
    if (!clean || !choice) return;
    if (!choice.choices.some((c) => c.label.toLowerCase() === clean.toLowerCase())) {
      onChoice({ ...choice, choices: [...choice.choices, { id: newId(), label: clean }] });
    }
    setLabel('');
  };
  return (
    <div className={`p-2 border bg-panel space-y-1.5 ${choice ? 'border-gold' : 'border-neutral-300'}`}>
      <div className="flex items-center gap-2">
        <Gift className="w-3.5 h-3.5 shrink-0 text-gold" />
        <span className="flex-1 min-w-0 font-semibold text-ink">{name}</span>
        <label className="flex items-center gap-1.5 text-[10px] font-black uppercase cursor-pointer" title="The client picks one version at the kiosk, e.g. Family, Barkada or Couple">
          <input type="checkbox" className="size-3.5 accent-gold" checked={!!choice}
            onChange={(e) => onChoice(e.target.checked ? { id: newId(), item: '', choices: [] } : undefined)} />
          Client chooses one
        </label>
        <button type="button" title="Move up" aria-label={`Move ${name} up`} disabled={!onUp} onClick={onUp} className={iconButton}><ChevronUp className="w-3.5 h-3.5" /></button>
        <button type="button" title="Move down" aria-label={`Move ${name} down`} disabled={!onDown} onClick={onDown} className={iconButton}><ChevronDown className="w-3.5 h-3.5" /></button>
        <button type="button" title="Remove freebie" onClick={onRemove} className="p-1 text-neutral-500 hover:text-red-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
      </div>
      {choice && (
        <div className="pl-5 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {choice.choices.map((c) => (
              <span key={c.id} className="flex items-center gap-1 px-2 py-0.5 border border-gold/60 bg-gold-wash text-ink">
                {c.label}
                <button type="button" title={`Remove ${c.label}`} onClick={() => onChoice({ ...choice, choices: choice.choices.filter((x) => x.id !== c.id) })}
                  className="text-neutral-500 hover:text-red-600 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {choice.choices.length < 2 && <span className="text-[10px] font-sans text-amber-800">Add at least two choices.</span>}
          </div>
          <div className="flex gap-1.5">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="A choice, e.g. Family"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              className="flex-1 min-w-0 min-h-[32px] p-1 border border-neutral-400 bg-canvas placeholder:italic placeholder:text-neutral-400" />
            <button type="button" disabled={!label.trim()} onClick={add}
              className="px-2 border border-line text-[10px] font-black uppercase cursor-pointer disabled:opacity-50"><Plus className="w-3 h-3 inline" /> Choice</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ③ Builds a package: its own poses (copied from saved poses or made here), frame, shots, exchanges and freebies. */
export const PackageBuilder: React.FC<PackageBuilderProps> = ({ items, sets, packages, pkg, onSave, onSaveItem, onSavePose, onClose }) => {
  const { toast } = useToast();
  const titleList = useId();
  const [code, setCode] = useState(pkg?.code ?? '');
  const [name, setName] = useState(pkg?.name ?? '');
  const [amount, setAmount] = useState(pkg?.amount ?? 0);
  const [kind, setKind] = useState<PackageKind>((pkg?.client_kind || 'school') as PackageKind);
  const [revenue, setRevenue] = useState<RevenueCategory | ''>(pkg ? pkg.revenue_category || '' : 'studio');
  const [requiresMua, setRequiresMua] = useState(!!pkg?.requires_mua);
  const [photoLimit, setPhotoLimit] = useState(pkg?.photo_selection_limit ?? 0);
  const catalog = makeCatalog(items, sets);
  const [structure, setStructure] = useState<PackageStructure>(() => (pkg?.structure ? readStructure(pkg.structure, catalog) : emptyStructure()));
  const [newFreebie, setNewFreebie] = useState('');
  const [newSize, setNewSize] = useState('');
  const [newKind, setNewKind] = useState<'print' | 'attire' | 'background'>('print');
  const [tagline, setTagline] = useState(pkg?.tagline ?? '');
  const [photos, setPhotos] = useState<PhotoDraft[]>(() => {
    if (!pkg) return [];
    const small = packagePhotoUrls(pkg, 'card');
    const full = packagePhotoUrls(pkg, 'full');
    return (pkg.photos ?? []).map((name, i) => ({ kind: 'saved' as const, key: name, name, url: small[i], fullUrl: full[i] }));
  });
  const [addingPhotos, setAddingPhotos] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  // Picked photos are previewed from memory until saved; free that memory when the builder closes.
  const pickedUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = pickedUrls.current;
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  const [previewing, setPreviewing] = useState(false);
  const [step, setStep] = useState<StepId>('details');
  const builderTop = useRef<HTMLDivElement>(null);
  const goTo = (next: StepId) => {
    setStep(next);
    builderTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const stepIndex = STEPS.findIndex((x) => x.id === step);
  const [saving, setSaving] = useState(false);

  const patch = (p: Partial<PackageStructure>) => setStructure((s) => ({ ...s, ...p }));
  const prints = totalPrints(structure, catalog);
  const poses = structure.inclusions.filter((e): e is PackagePose => e.type === 'pose');
  const preview = renderPackage(structure, catalog, photoLimit);
  const otherPackages = packages.filter((p) => p.id !== pkg?.id && p.structure);
  // Titles used before, so the same pose is spelled the same way everywhere.
  const titles = [...new Set([
    ...sets.map((s) => s.name),
    ...packages.flatMap((p) => readStructure(p.structure).inclusions.flatMap((e) => (e.type === 'pose' ? [e.title] : []))),
    ...poses.map((p) => p.title),
  ].map((t) => t.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const setInclusion = (index: number, next: PackageInclusionRef) =>
    patch({ inclusions: structure.inclusions.map((e, i) => (i === index ? next : e)) });
  const moveInclusion = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= structure.inclusions.length) return;
    const next = [...structure.inclusions];
    [next[index], next[to]] = [next[to], next[index]];
    patch({ inclusions: next });
  };
  const removeInclusion = (index: number) => {
    const removed = structure.inclusions[index];
    patch({
      inclusions: structure.inclusions.filter((_, i) => i !== index),
      // An exchange starts from a pose in this package.
      exchanges: removed.type === 'pose' ? structure.exchanges.filter((ex) => ex.pose !== removed.id) : structure.exchanges,
    });
  };
  const duplicatePose = (index: number, pose: PackagePose) => {
    const next = [...structure.inclusions];
    next.splice(index + 1, 0, { ...pose, id: newId(), items: pose.items.map((r) => ({ ...r })) });
    patch({ inclusions: next });
  };
  const addPose = (pose: PackagePose) => patch({ inclusions: [...structure.inclusions, pose] });
  // Freebies show at the kiosk in this order.
  const moveFreebie = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= structure.freebies.length) return;
    const next = [...structure.freebies];
    [next[index], next[to]] = [next[to], next[index]];
    patch({ freebies: next });
  };
  const updateExchange = (id: string, p: Partial<PackageExchange>) =>
    patch({ exchanges: structure.exchanges.map((ex) => (ex.id === id ? { ...ex, ...p } : ex)) });
  const updateOption = (ex: PackageExchange, index: number, p: Partial<ExchangeOption>) =>
    updateExchange(ex.id, { options: ex.options.map((o, i) => (i === index ? { ...o, ...p } : o)) });

  const copyFrom = (id: string) => {
    const source = otherPackages.find((p) => p.id === id);
    if (!source) return;
    const busy = structure.inclusions.length || structure.exchanges.length || structure.freebies.length || structure.frame_item;
    if (busy && !window.confirm(`Replace this package's contents with a copy of "${source.name}"? Name, code and price stay.`)) return;
    setStructure(copyStructure(readStructure(source.structure, catalog)));
    setPhotoLimit(source.photo_selection_limit ?? 0);
    toast.success(`Copied from "${source.name}". Change what differs, then save.`);
  };

  const saveAsTemplate = async (pose: { title: string; items: PoseRow[] }) => {
    const rows = filledRows(pose.items);
    if (!pose.title.trim() || !rows.length) { toast.error('Give the pose a title and at least one size first.'); return; }
    try {
      await onSavePose(null, { name: pose.title.trim(), items: rows });
      toast.success(`"${pose.title.trim()}" saved. Add it to any package from "From saved pose".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The pose could not be saved.');
    }
  };

  const createAttire = async (name: string): Promise<string | null> => {
    const existing = items.find((i) => i.category === 'attire' && i.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing.id;
    try {
      const item = await onSaveItem(null, { name, category: 'attire' });
      toast.success(`Attire "${item.name}" created. Choose its background.`);
      return item.id;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The attire could not be created.');
      return null;
    }
  };
  // New poses start on the studio's usual background (Colored), changeable in the pose.
  const defaultBackground = (items.find((i) => i.category === 'background' && /colou?red/i.test(i.name))
    ?? items.find((i) => i.category === 'background'))?.id;

  const createSize = async () => {
    if (!newSize.trim()) return;
    try {
      const item = await onSaveItem(null, { name: newSize.trim(), category: newKind });
      toast.success(`"${item.name}" created. Choose it in any pose.`);
      setNewSize('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'It could not be created.');
    }
  };

  const createFreebie = async () => {
    if (!newFreebie.trim()) return;
    try {
      const item = await onSaveItem(null, { name: newFreebie.trim(), category: 'other' });
      patch({ freebies: [...structure.freebies, item.id] });
      setNewFreebie('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The freebie could not be created.');
    }
  };

  // What still needs fixing, and on which step.
  const issues: { step: StepId; text: string }[] = [];
  if (!code.trim()) issues.push({ step: 'details', text: 'Enter a package code.' });
  if (!name.trim()) issues.push({ step: 'details', text: 'Enter the package name.' });
  if (!Number.isFinite(amount) || amount < 0) issues.push({ step: 'details', text: 'Enter a price of zero or more.' });
  if (poses.some((p) => !poseTitle(p, catalog).trim())) issues.push({ step: 'prints', text: 'Choose an attire (or type a title) for every pose.' });
  for (const ex of structure.exchanges) {
    const target = poses.find((p) => p.id === ex.pose);
    if (!target) issues.push({ step: 'shoot', text: 'Choose the pose each exchange swaps.' });
    else if (!ex.options.length) issues.push({ step: 'shoot', text: `Add options to exchange "${poseTitle(target, catalog)}" for.` });
    else if (ex.options.some((o) => !poseTitle(o, catalog).trim())) issues.push({ step: 'shoot', text: `Choose an attire (or type a title) for every option for "${poseTitle(target, catalog)}".` });
  }
  for (const fc of structure.freebie_choices) {
    if (fc.choices.length < 2) issues.push({ step: 'freebies', text: `Give "${catalog.items.get(fc.item)?.name ?? 'the freebie'}" at least two choices, or switch its choices off.` });
  }
  const problems = issues.map((i) => i.text);

  const save = async () => {
    if (issues.length) { toast.error(issues[0].text); goTo(issues[0].step); return; }
    setSaving(true);
    try {
      await onSave(pkg?.id ?? null, {
        code, name, amount, photo_selection_limit: structure.unlimited_shots ? photoLimit : 0,
        requires_mua: requiresMua,
        client_kind: kind, revenue_category: revenue, tagline, photos,
        structure: {
          ...structure,
          inclusions: structure.inclusions.map((e) => (e.type === 'pose' ? { ...e, title: poseTitle(e, catalog).trim(), items: filledRows(e.items) } : e)),
          exchanges: structure.exchanges.map((ex) => ({ ...ex, options: ex.options.map((o) => ({ ...o, title: poseTitle(o, catalog).trim(), items: filledRows(o.items) })) })),
        },
      });
      toast.success(pkg ? `"${name.trim()}" saved. The kiosk shows the changes.` : `"${name.trim()}" created and active.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The package could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const frameName = structure.frame_item ? catalog.items.get(structure.frame_item)?.name ?? '' : '';
  const autoTagline = frameName ? `with ${frameName.replace(/^with\s+/i, '')}` : '';
  // The package as the kiosk would receive it, for "Preview as kiosk".
  const addPhotos = async (files: FileList | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!list.length) return;
    const room = MAX_PACKAGE_PHOTOS - photos.length;
    if (list.length > room) toast.error(`A package can show up to ${MAX_PACKAGE_PHOTOS} photos; ${room ? `added the first ${room}` : 'remove one first'}.`);
    setAddingPhotos(true);
    try {
      const added: PhotoDraft[] = [];
      for (const original of list.slice(0, Math.max(0, room))) {
        const file = await shrinkPhoto(original);
        const url = URL.createObjectURL(file);
        pickedUrls.current.add(url);
        added.push({ kind: 'new', key: url, file, url });
      }
      setPhotos((current) => [...current, ...added]);
    } finally {
      setAddingPhotos(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };
  const movePhoto = (index: number, to: number) => setPhotos((current) => {
    if (to < 0 || to >= current.length) return current;
    const next = [...current];
    const [photo] = next.splice(index, 1);
    next.splice(to, 0, photo);
    return next;
  });
  const removePhoto = (index: number) => setPhotos((current) => {
    const photo = current[index];
    if (photo?.kind === 'new') { URL.revokeObjectURL(photo.url); pickedUrls.current.delete(photo.url); }
    return current.filter((_, i) => i !== index);
  });

  const draft: Package = {
    id: pkg?.id ?? 'draft', code, name, amount, tagline, description: pkg?.description,
    inclusions: preview.inclusions, freebies: preview.freebies, option_groups: preview.optionGroups,
    photo_selection_limit: structure.unlimited_shots ? photoLimit : 0,
  };

  const poseLabel = (pose: PackagePose) => `${poseTitle(pose, catalog) || 'Untitled pose'} (${rowSummary(pose.items.filter((r) => r.item), catalog)})`;

  return (
    <div className="bg-panel border-2 border-gold shadow-lux-gold p-5 space-y-4 font-mono text-xs">
      <datalist id={titleList}>{titles.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-line">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
          {pkg ? `③ Editing package // ${pkg.code}` : '③ Create a package'}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {otherPackages.length > 0 && (
            <select value="" aria-label="Copy from package" onChange={(e) => copyFrom(e.target.value)}
              className="min-h-[32px] p-1 border border-gold/70 bg-canvas text-[10px] font-black uppercase cursor-pointer">
              <option value="">⧉ Copy from package…</option>
              {otherPackages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          )}
          <button type="button" onClick={onClose} className="flex items-center gap-1 px-2 py-1 border border-neutral-400 font-bold uppercase cursor-pointer">
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
      </div>

      {/* Steps: one section at a time; any step can be opened. */}
      <nav ref={builderTop} aria-label="Package builder steps" className="scroll-mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((x, i) => {
          const Icon = x.icon;
          const active = x.id === step;
          const open = issues.some((issue) => issue.step === x.id);
          return (
            <button key={x.id} type="button" onClick={() => goTo(x.id)} aria-current={active ? 'step' : undefined}
              className={`relative flex-1 min-w-[8.5rem] flex items-center gap-2 px-2.5 py-2 border-2 text-left cursor-pointer transition-colors ${
                active ? 'border-gold bg-gold-wash' : 'border-neutral-300 bg-canvas hover:border-line'}`}>
              <span className={`shrink-0 w-6 h-6 flex items-center justify-center text-[11px] font-black ${active ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-ink"><Icon className="w-3 h-3 text-gold" /> {x.label}</span>
                <span className="block text-[9px] font-sans normal-case text-neutral-500 truncate">{x.hint}</span>
              </span>
              {open && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" aria-label="Needs attention" />}
            </button>
          );
        })}
      </nav>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="space-y-3">
          {step === 'details' && (<>
          {/* Details */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[11px] font-black uppercase mb-1">Package code <span className="text-red-500">*</span></span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="STD-PKG-A"
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas uppercase font-bold" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-black uppercase mb-1">Price (₱) <span className="text-red-500">*</span></span>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-black" />
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] font-black uppercase mb-1">Package name <span className="text-red-500">*</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard Package A"
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold" />
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] font-black uppercase mb-1">Line under the price <span className="font-normal normal-case text-neutral-500">(optional)</span></span>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120}
                placeholder={autoTagline ? `Leave empty to show: ${autoTagline}` : 'e.g. with 10x12 PREMIUM frame'}
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-canvas font-semibold placeholder:font-normal placeholder:italic placeholder:text-neutral-400" />
            </label>
          </div>
          <PackageKindInput value={kind} onChange={setKind} />
          <RevenueInput value={revenue} onChange={(value) => { setRevenue(value); if (value !== 'mua') setRequiresMua(false); }} />
          <MuaRequirementInput checked={requiresMua} onChange={setRequiresMua} revenue={revenue} amount={amount} />

          </>)}
          {step === 'photos' && (<>
          {/* Photos */}
          <Card icon={Images} title="Photos" aside={<span className="text-neutral-500 normal-case">{photos.length}/{MAX_PACKAGE_PHOTOS}</span>}
            hint="The flyer and sample shots clients see at the kiosk. The first photo is the cover on the package card. Photos are made smaller before upload, and are saved with the package.">
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <figure key={photo.key} className={`relative border-2 bg-obsidian ${index === 0 ? 'border-gold' : 'border-neutral-300'}`}>
                    <img src={photo.url} alt={`Package photo ${index + 1}`} className="w-full aspect-[4/3] object-cover" />
                    {index === 0 && <span className="absolute top-1 left-1 flex items-center gap-0.5 px-1 bg-gold text-on-gold text-[9px] font-black uppercase"><Star className="w-2.5 h-2.5" /> Cover</span>}
                    {photo.kind === 'new' && <span className="absolute top-1 right-1 px-1 bg-obsidian/80 text-gold text-[9px] font-black uppercase">Not saved</span>}
                    <figcaption className="flex items-center justify-between gap-1 p-1 bg-panel">
                      <span className="flex gap-1">
                        <button type="button" title="Move left" disabled={index === 0} onClick={() => movePhoto(index, index - 1)} className={iconButton}><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <button type="button" title="Move right" disabled={index === photos.length - 1} onClick={() => movePhoto(index, index + 1)} className={iconButton}><ChevronRight className="w-3.5 h-3.5" /></button>
                      </span>
                      {index > 0 && (
                        <button type="button" title="Make this the cover" onClick={() => movePhoto(index, 0)}
                          className="px-1.5 py-1 border border-neutral-300 hover:border-line text-[9px] font-black uppercase cursor-pointer">Cover</button>
                      )}
                      <button type="button" title="Remove photo" onClick={() => removePhoto(index)} className={`${iconButton} text-neutral-500 hover:text-red-600`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
              onChange={(e) => void addPhotos(e.target.files)} />
            <button type="button" disabled={addingPhotos || photos.length >= MAX_PACKAGE_PHOTOS} onClick={() => photoInput.current?.click()}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 border-2 border-dashed border-gold/70 text-gold-soft font-black uppercase cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {addingPhotos ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {addingPhotos ? 'Preparing photos…' : photos.length ? 'Add more photos' : 'Add the flyer or sample photos'}
            </button>
          </Card>

          </>)}
          {step === 'prints' && (<>
          {/* ★ Frame and Prints */}
          <Card icon={Frame} title="★ Frame and Prints" aside={<span className="text-gold-soft normal-case">{prints ? `${prints} pcs hard printout copy` : 'No prints yet'}</span>}
            hint="Choose the frame. The hard printout count adds up the prints in the poses below.">
            <ItemSelect items={items} value={structure.frame_item} onChange={(id) => patch({ frame_item: id })} placeholder="No frame" only={['frame']} />
            {!items.some((i) => i.category === 'frame') && <p className="text-[10px] text-amber-800 font-sans">Add a Frame item in Single Items first (e.g. 13x16 classic frame).</p>}
          </Card>

          {/* Poses */}
          <Card icon={Layers} title="Poses and prints"
            hint={<>A pose is one product: an <b>attire</b> shot on a <b>background</b>, and the prints made from it. The background
              belongs to every print in that pose, so prints on another background are another pose of the same attire (Toga w/out cap
              on Colored, then Toga w/out cap on B&amp;W). Each pose has its own sizes and quantities. Every attire is listed with the
              shoot, and at the kiosk the prints are grouped by attire, then background. Copying a saved pose never links it.</>}>
            {!structure.inclusions.length && (
              <p className="p-3 text-center border border-dashed border-neutral-300 text-neutral-500 font-sans italic">
                Nothing included yet. Add a pose, start from a saved pose, or copy another package.
              </p>
            )}
            <div className="space-y-2">
              {structure.inclusions.map((entry, index) => {
                const order = (
                  <>
                    <button type="button" title="Move up" disabled={index === 0} onClick={() => moveInclusion(index, -1)} className={iconButton}><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Move down" disabled={index === structure.inclusions.length - 1} onClick={() => moveInclusion(index, 1)} className={iconButton}><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Remove" onClick={() => removeInclusion(index)} className={`${iconButton} text-neutral-500 hover:text-red-600`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                );
                if (entry.type === 'pose') {
                  const exchanged = structure.exchanges.some((ex) => ex.pose === entry.id);
                  return (
                    <PoseEditor key={entry.id} look={entry} rows={entry.items} items={items} catalog={catalog} titleList={titleList}
                      onLook={(look) => setInclusion(index, { type: 'pose', id: entry.id, items: entry.items, ...look })} onCreateAttire={createAttire} onRows={(rows) => setInclusion(index, { ...entry, items: rows })}
                      tools={(
                        <>
                          <button type="button" title="Duplicate this pose (then change its sizes)" onClick={() => duplicatePose(index, entry)} className={iconButton}><Copy className="w-3.5 h-3.5" /></button>
                          <button type="button" title="Save as a saved pose, to reuse in other packages" onClick={() => void saveAsTemplate(entry)} className={iconButton}><BookmarkPlus className="w-3.5 h-3.5" /></button>
                          {order}
                        </>
                      )}
                      below={exchanged ? <p className="text-[10px] font-bold text-gold-soft">⇄ Clients may exchange this pose (see Exchange below).</p> : undefined} />
                  );
                }
                const item = catalog.items.get(entry.id);
                return (
                  <div key={`item-${entry.id}`} className="flex items-center gap-1.5 p-2 border border-neutral-300 bg-panel">
                    <QtyStepper value={entry.qty} onChange={(qty) => setInclusion(index, { ...entry, qty })} />
                    <span className="flex-1 min-w-0 font-semibold text-ink">{item?.name ?? <span className="text-red-700">Missing item (removed from the catalog)</span>}</span>
                    {order}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => addPose({ type: 'pose', id: newId(), title: '', background: defaultBackground, items: [{ item: '', qty: 1 }] })}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-obsidian text-gold border border-line text-[10px] font-black uppercase cursor-pointer">
                <Plus className="w-3 h-3" /> New pose
              </button>
              <SavedPoseSelect sets={sets} catalog={catalog} label="+ From saved pose…" onPick={(set) => addPose(poseFromSaved(set))} />
              <div className="min-w-[10rem] flex-1">
                <ItemSelect items={items.filter((i) => !structure.inclusions.some((e) => e.type === 'item' && e.id === i.id))} value=""
                  onChange={(id) => { if (id) patch({ inclusions: [...structure.inclusions, { type: 'item', id, qty: 1 }] }); }}
                  placeholder="+ A single item on its own…" only={['print', 'other']} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-dashed border-neutral-300">
              <Printer className="w-3.5 h-3.5 text-gold" />
              <span className="text-[10px] font-black uppercase text-neutral-600">Not in the list? New</span>
              <select value={newKind} onChange={(e) => setNewKind(e.target.value as typeof newKind)} aria-label="What to create"
                className="min-h-[32px] p-1 border border-neutral-400 bg-panel text-[10px] font-black uppercase">
                <option value="print">Print size</option>
                <option value="attire">Attire</option>
                <option value="background">Background</option>
              </select>
              <input value={newSize} onChange={(e) => setNewSize(e.target.value)}
                placeholder={{ print: 'e.g. 5R', attire: 'e.g. Toga w/ cap', background: 'e.g. B&W' }[newKind]}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createSize(); } }}
                className="w-36 min-h-[32px] p-1 border border-neutral-400 bg-panel placeholder:italic placeholder:text-neutral-400" />
              <button type="button" disabled={!newSize.trim()} onClick={() => void createSize()}
                className="px-2 min-h-[32px] border border-line text-[10px] font-black uppercase cursor-pointer disabled:opacity-50">Create</button>
            </div>
          </Card>

          </>)}
          {step === 'shoot' && (<>
          {/* ★ Unlimited shots */}
          <Card icon={Camera} title="★ Unlimited shots">
            <label className="flex items-center gap-2 font-bold cursor-pointer">
              <input type="checkbox" className="size-4 accent-gold" checked={structure.unlimited_shots}
                onChange={(e) => patch({ unlimited_shots: e.target.checked })} />
              This package includes unlimited shots
            </label>
            {structure.unlimited_shots && <PhotoLimitInput value={photoLimit} onChange={setPhotoLimit} />}
          </Card>

          {/* Exchanges */}
          <Card icon={ArrowLeftRight} title="Exchange" hint="Let clients wear another attire instead of one pose, e.g. instead of Filipiniana: Glamour shots (girls) or Coat and tie (boys). An option keeps the same prints, quantities and background; only the attire changes.">
            {structure.exchanges.map((ex) => {
              const target = poses.find((p) => p.id === ex.pose);
              return (
                <div key={ex.id} className="p-2.5 border-2 border-gold/60 bg-panel space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <label className="block min-w-0">
                      <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Instead of</span>
                      <select value={ex.pose} onChange={(e) => updateExchange(ex.id, { pose: e.target.value })}
                        className="w-full min-h-[38px] p-1.5 border border-neutral-400 bg-canvas font-bold truncate">
                        <option value="">Choose a pose in this package…</option>
                        {poses.filter((p) => p.id === ex.pose || !structure.exchanges.some((o) => o.pose === p.id)).map((p) => <option key={p.id} value={p.id}>{poseLabel(p)}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Shown to clients as</span>
                      <input value={ex.name} onChange={(e) => updateExchange(ex.id, { name: e.target.value })} placeholder="Attire"
                        className="w-full min-h-[38px] p-1.5 border border-neutral-400 bg-canvas font-semibold" />
                    </label>
                    <button type="button" title="Remove exchange" onClick={() => patch({ exchanges: structure.exchanges.filter((o) => o.id !== ex.id) })}
                      className="p-2 text-red-600 border border-neutral-300 hover:border-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {target && (
                    <label className="block">
                      <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">Who can keep {poseTitle(target, catalog) || 'this pose'}</span>
                      <select value={ex.keep_for} onChange={(e) => updateExchange(ex.id, { keep_for: e.target.value as PackageExchange['keep_for'] })}
                        className="w-full min-h-[38px] p-1.5 border border-neutral-400 bg-canvas font-bold">
                        <option value="all">Everyone</option>
                        <option value="female">Girls only (boys must exchange it)</option>
                        <option value="male">Boys only (girls must exchange it)</option>
                      </select>
                    </label>
                  )}
                  <span className="block text-[9px] font-black uppercase text-neutral-600">Options</span>
                  {ex.options.map((opt, i) => (
                    <PoseEditor key={opt.id} look={opt} rows={opt.items} items={items} catalog={catalog} titleList={titleList}
                      sameAs={{ background: target?.background ? catalog.items.get(target.background)?.name ?? '' : '', prints: target ? (printRows(target.items, catalog).length ? rowSummary(printRows(target.items, catalog), catalog) : 'no prints') : 'choose the pose above' }}
                      onLook={(look) => updateExchange(ex.id, { options: ex.options.map((o, j) => (j === i ? { id: o.id, for: o.for, items: o.items, ...look } : o)) })} onCreateAttire={createAttire} onRows={(rows) => updateOption(ex, i, { items: rows })}
                      tools={(
                        <>
                          <select value={opt.for} aria-label="Who sees this option" onChange={(e) => updateOption(ex, i, { for: e.target.value as ExchangeOption['for'] })}
                            className="min-h-[36px] p-1 border border-neutral-400 bg-canvas font-bold">
                            {(['all', 'female', 'male'] as const).map((v) => <option key={v} value={v}>{FOR_LABELS[v]}</option>)}
                          </select>
                          <button type="button" title="Remove option" onClick={() => updateExchange(ex.id, { options: ex.options.filter((_, j) => j !== i) })}
                            className={`${iconButton} text-neutral-500 hover:text-red-600`}><Trash2 className="w-3.5 h-3.5" /></button>
                        </>
                      )} />
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => updateExchange(ex.id, { options: [...ex.options, { id: newId(), title: '', for: 'all', items: [] }] })}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer">
                      <Plus className="w-3 h-3" /> Option (another attire)
                    </button>
                  </div>
                </div>
              );
            })}
            <button type="button" disabled={!poses.some((p) => !structure.exchanges.some((ex) => ex.pose === p.id))}
              onClick={() => patch({ exchanges: [...structure.exchanges, { id: newId(), name: 'Attire', pose: '', keep_for: 'all', options: [] }] })}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-neutral-400 hover:border-line cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus className="w-3 h-3" /> Exchange
            </button>
            {!poses.length && <p className="text-[10px] text-neutral-500 font-sans">Add a pose first; an exchange swaps one of them.</p>}
          </Card>

          </>)}
          {step === 'freebies' && (<>
          {/* Freebies */}
          <Card icon={Gift} title="Freebies" hint={<>Free extras, chosen from your single items, shown to clients in this order (use ↑ ↓ to move one). Switch on <b>Client chooses one</b> when the client picks a version, e.g. Free 7x9 classic frame: Family, Barkada or Couple.</>}>
            <div className="space-y-1.5">
              {structure.freebies.map((id, index) => (
                <FreebieRow key={id} name={catalog.items.get(id)?.name ?? 'Missing item'}
                  onUp={index > 0 ? () => moveFreebie(index, -1) : undefined}
                  onDown={index < structure.freebies.length - 1 ? () => moveFreebie(index, 1) : undefined}
                  choice={structure.freebie_choices.find((fc) => fc.item === id)}
                  onChoice={(choice) => patch({ freebie_choices: [
                    ...structure.freebie_choices.filter((fc) => fc.item !== id),
                    ...(choice ? [{ ...choice, item: id }] : []),
                  ] })}
                  onRemove={() => patch({ freebies: structure.freebies.filter((f) => f !== id), freebie_choices: structure.freebie_choices.filter((fc) => fc.item !== id) })} />
              ))}
              {!structure.freebies.length && <span className="text-neutral-500 font-sans italic">No freebies.</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">+ Add a freebie</span>
                <ItemSelect items={items.filter((i) => !structure.freebies.includes(i.id))} value=""
                  onChange={(id) => { if (id) patch({ freebies: [...structure.freebies, id] }); }} placeholder="Choose to add…" />
              </label>
              <div className="flex gap-1.5 min-w-0 self-end">
                <input value={newFreebie} onChange={(e) => setNewFreebie(e.target.value)} placeholder="Or type a new one, e.g. Free family picture"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createFreebie(); } }}
                  className="flex-1 min-w-0 min-h-[38px] p-1.5 border border-neutral-400 bg-panel placeholder:italic placeholder:text-neutral-400" />
                <button type="button" disabled={!newFreebie.trim()} onClick={() => void createFreebie()}
                  className="px-3 border border-line font-black uppercase cursor-pointer disabled:opacity-50">Create</button>
              </div>
            </div>
          </Card>

          {structure.choice_groups.length > 0 && (
            <Card icon={AlertTriangle} title="Older choices" hint="Choices made before the package builder. They still show at the kiosk; remove them or redo them as an Exchange.">
              {structure.choice_groups.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2 p-2 border border-neutral-300 bg-panel">
                  <span className="min-w-0"><b>{g.name}</b>: {g.choices.map((c) => c.label).join(', ')}</span>
                  <button type="button" title="Remove" onClick={() => patch({ choice_groups: structure.choice_groups.filter((x) => x.id !== g.id) })}
                    className="p-1 text-red-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </Card>
          )}
          </>)}

          {/* Back / Next; the last step saves. */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-line">
            <button type="button" disabled={stepIndex === 0} onClick={() => goTo(STEPS[stepIndex - 1].id)}
              className="btn-tactile min-h-[42px] px-4 flex items-center gap-1.5 border border-neutral-400 bg-canvas font-black uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <span className="text-[10px] font-black uppercase text-neutral-500">Step {stepIndex + 1} of {STEPS.length}</span>
            {stepIndex < STEPS.length - 1 ? (
              <button type="button" onClick={() => goTo(STEPS[stepIndex + 1].id)}
                className="btn-tactile min-h-[42px] px-4 flex items-center gap-1.5 bg-obsidian text-gold border border-line font-black uppercase cursor-pointer">
                Next: {STEPS[stepIndex + 1].label} <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" onClick={() => void save()} disabled={saving}
                className="btn-tactile min-h-[42px] px-4 flex items-center gap-1.5 bg-gold text-on-gold border border-gold font-black uppercase cursor-pointer disabled:opacity-50">
                <Check className="w-4 h-4" /> {pkg ? 'Save package' : 'Create package'}
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <aside className="xl:sticky xl:top-4 space-y-3">
          <section className="p-3 border-2 border-line bg-canvas space-y-2">
            <h4 className="flex items-center gap-2 text-[11px] font-black uppercase text-ink"><Eye className="w-4 h-4 text-gold" /> What clients see</h4>
            <div className="font-black uppercase text-ink">{name || 'Package name'} <span className="text-gold-soft">{formatCurrency(amount)}</span></div>
            {preview.inclusions.length ? <InclusionTreeView inclusions={preview.inclusions} /> : <p className="text-neutral-500 font-sans italic">Nothing included yet.</p>}
            {preview.optionGroups.length > 0 && (
              <div className="text-[11px] font-sans space-y-1">
                {preview.optionGroups.map((g) => (
                  <p key={g.id}><b>{g.name}:</b> {g.replaces ? <>keep {g.replaces}{g.replaces_for && g.replaces_for !== 'all' ? ` (${g.replaces_for} only)` : ''}, or </> : null}
                    {g.choices.map((c) => `${c.label}${c.for !== 'all' ? ` (${c.for})` : ''}`).join(' / ')}</p>
                ))}
              </div>
            )}
            {preview.freebies.length > 0 && (
              <p className="text-[11px] font-sans"><b>Freebies:</b> {preview.freebies.join(' · ')}</p>
            )}
          </section>
          {problems.length > 0 && (
            <ul className="p-2 border border-red-400 bg-red-50 text-red-800 font-sans text-[11px] space-y-1">
              {issues.map((issue) => (
                <li key={issue.text}>
                  <button type="button" onClick={() => goTo(issue.step)} className="text-left underline-offset-2 hover:underline cursor-pointer">
                    • {issue.text} <span className="font-bold">({STEPS.find((x) => x.id === issue.step)?.label})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setPreviewing(true)}
            className="btn-tactile w-full min-h-[42px] flex items-center justify-center gap-2 bg-canvas text-ink border border-gold font-black uppercase tracking-wider cursor-pointer">
            <MonitorSmartphone className="w-4 h-4 text-gold" /> Preview as kiosk
          </button>
          <button type="button" onClick={() => void save()} disabled={saving}
            className="btn-tactile w-full min-h-[46px] flex items-center justify-center gap-2 bg-obsidian text-gold border border-line font-black uppercase tracking-widest cursor-pointer disabled:opacity-50">
            <Check className="w-4 h-4" /> {pkg ? 'Save package' : 'Create package'}
          </button>
        </aside>
      </div>
      {previewing && (
        <PackageDetailsModal pkg={draft} isSelected={false} onSelect={() => {}} onClose={() => setPreviewing(false)} preview
          photoUrls={photos.map((photo) => (photo.kind === 'saved' ? photo.fullUrl : photo.url))} />
      )}
    </div>
  );
};
