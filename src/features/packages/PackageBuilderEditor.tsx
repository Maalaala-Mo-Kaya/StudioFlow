import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type { AddOn, Package } from '../../types';
import { PackageShowcase } from './PackageShowcase';
import { definition, sectionTypes, type PackageDraft, type PackageSection } from './packageBuilder';
import { graduationTemplates } from './graduationTemplates';

const field = 'min-h-10 w-full min-w-0 border border-line bg-canvas px-2 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-gold';
const button = 'inline-flex min-h-10 items-center justify-center gap-1.5 border border-line bg-obsidian px-3 text-xs font-bold text-gold disabled:opacity-40';
const primary = 'min-h-10 border border-gold bg-gold px-3 text-xs font-black text-on-gold disabled:opacity-40';
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const initial = (pkg?: Package): PackageDraft => pkg?.builder_draft ?? {
  code: pkg?.code ?? '', name: pkg?.name ?? '', amount: pkg?.amount ?? 1000, description: pkg?.description ?? '',
  client_kind: pkg?.client_kind || 'school', revenue_category: pkg ? pkg.revenue_category || '' : 'studio',
  photo_selection_limit: pkg?.photo_selection_limit ?? 0, requires_mua: !!pkg?.requires_mua,
  is_active: pkg?.is_active !== false, builder: pkg ? { ...definition(pkg), reviewNotes: pkg.builder_review } : { sections: [] },
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1"><span className="block text-xs font-bold text-ink">{label}</span>{children}</label>;
}

function Text({ label, value = '', onChange, multiline = false }: { label: string; value?: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <Field label={label}>{multiline
    ? <textarea className={field} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    : <input className={field} value={value} onChange={(e) => onChange(e.target.value)} />}</Field>;
}

function NumberField({ label, value, min = 0, step = 1, onChange }: {
  label: string; value?: number; min?: number; step?: number; onChange: (value: number | undefined) => void;
}) {
  return <Field label={label}><input className={field} type="number" min={min} step={step} value={value ?? ''}
    onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></Field>;
}

function ImageField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const { toast } = useToast();
  return <div className="space-y-1">
    <Text label={label} value={value?.startsWith('data:') ? '' : value} onChange={onChange} />
    <div className="flex flex-wrap items-center gap-2">
      <input aria-label={`Upload ${label.toLowerCase()}`} type="file" accept="image/jpeg,image/png,image/webp" className="max-w-full text-xs"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          if (file.size > 350000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            toast.error('Use a JPEG, PNG or WebP image under 350 KB.');
            return;
          }
          const reader = new FileReader();
          reader.onload = () => { if (typeof reader.result === 'string') onChange(reader.result); };
          reader.onerror = () => toast.error('The image could not be read.');
          reader.readAsDataURL(file);
        }} />
      {value && <button type="button" onClick={() => onChange('')} className="text-xs font-bold underline">Remove image</button>}
    </div>
    {value?.startsWith('data:') && <p className="text-xs text-gold-soft">Image attached</p>}
  </div>;
}

function Checkbox({ label, checked, disabled, onChange }: { label: string; checked?: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" className="accent-gold"
    checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

function CatalogReference({ addOns, value = '', onChange }: { addOns: AddOn[]; value?: string; onChange: (id: string) => void }) {
  return <Field label="Catalog add-on reference"><select className={field} value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">No catalog reference</option>
    {value && !addOns.some((item) => item.id === value) && <option value={value}>Unavailable catalog item</option>}
    {addOns.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
  </select></Field>;
}

function SectionRows({ section, addOns, onChange }: { section: PackageSection; addOns: AddOn[]; onChange: (patch: Partial<PackageSection>) => void }) {
  const { type } = section;
  if (type === 'inclusions') {
    const items = section.items ?? [];
    return <>
      <Checkbox label="List these as freebies" checked={section.freebies} onChange={(freebies) => onChange({ freebies })} />
      {items.map((item, index) => {
        const update = (patch: Partial<typeof item>) => onChange({ items: items.map((value, i) => i === index ? { ...value, ...patch } : value) });
        return <div className="grid gap-2 border border-line p-3 sm:grid-cols-2" key={index}>
          <Text label="Item name" value={item.name} onChange={(name) => update({ name })} />
          <NumberField label="Quantity (optional)" min={1} value={item.quantity} onChange={(quantity) => update({ quantity })} />
          <Text label="Item description" value={item.description} onChange={(description) => update({ description })} />
          <CatalogReference addOns={addOns} value={item.addOn} onChange={(addOn) => update({ addOn, name: item.name || addOns.find((entry) => entry.id === addOn)?.name || '' })} />
          <ImageField label="Item image or icon" value={item.image} onChange={(image) => update({ image })} />
          <button type="button" className={button} onClick={() => onChange({ items: items.filter((_, i) => i !== index) })}>Remove item</button>
        </div>;
      })}
      <button type="button" className={button} onClick={() => onChange({ items: [...items, { name: '' }] })}>Add item</button>
    </>;
  }
  if (type === 'prints') {
    const prints = section.prints ?? [];
    return <>
      {prints.map((row, index) => {
        const update = (patch: Partial<typeof row>) => onChange({ prints: prints.map((value, i) => i === index ? { ...value, ...patch } : value) });
        return <div className="grid gap-2 border border-line p-3 sm:grid-cols-2" key={index}>
          <Text label="Photo category or pose" value={row.pose} onChange={(pose) => update({ pose })} />
          <Text label="Print size" value={row.size} onChange={(size) => update({ size })} />
          <NumberField label="Print quantity" min={1} value={row.quantity} onChange={(quantity) => update({ quantity: quantity ?? 0 })} />
          <Text label="Alternative group (optional)" value={row.alternative} onChange={(alternative) => update({ alternative })} />
          <Text label="Print notes" value={row.notes} onChange={(notes) => update({ notes })} />
          <button type="button" className={button} onClick={() => onChange({ prints: prints.filter((_, i) => i !== index) })}>Remove print</button>
        </div>;
      })}
      <button type="button" className={button} onClick={() => onChange({ prints: [...prints, { pose: '', size: '', quantity: 1 }] })}>Add print</button>
    </>;
  }
  if (type !== 'options') return null;
  const choices = section.choices ?? [];
  return <>
    <div className="grid gap-2 sm:grid-cols-3">
      <NumberField label="Minimum (0 = optional)" value={section.min} onChange={(min) => onChange({ min: min ?? 0 })} />
      <NumberField label="Maximum" min={1} value={section.max} onChange={(max) => onChange({ max: max ?? 0 })} />
      <Field label="Choice display"><select className={field} value={section.display ?? 'list'}
        onChange={(e) => onChange({ display: e.target.value as PackageSection['display'] })}>
        <option value="list">List</option><option value="cards">Image cards</option><option value="dropdown">Dropdown</option>
      </select></Field>
    </div>
    {choices.map((choice) => {
      const update = (patch: Partial<typeof choice>) => onChange({ choices: choices.map((item) => item.id === choice.id ? { ...item, ...patch } : item) });
      const reference = addOns.find((item) => item.id === choice.addOn);
      return <div key={choice.id} className="grid gap-2 border border-line p-3 sm:grid-cols-2">
        <Text label="Choice name" value={choice.name} onChange={(name) => update({ name })} />
        <Text label="Choice description" value={choice.description} onChange={(description) => update({ description })} />
        <ImageField label="Choice image" value={choice.image} onChange={(image) => update({ image })} />
        <Field label="Recommended for"><select className={field} value={choice.recommendation ?? ''}
          onChange={(e) => { const recommendation = e.target.value as typeof choice.recommendation; update({ recommendation, preselect: !!recommendation && choice.preselect }); }}>
          <option value="">No recommendation</option><option value="male">Male</option><option value="female">Female</option><option value="any">Any gender</option>
        </select></Field>
        <Checkbox label="Preselect for matching clients" checked={choice.preselect} disabled={!choice.recommendation} onChange={(preselect) => update({ preselect })} />
        <CatalogReference addOns={addOns} value={choice.addOn} onChange={(addOn) => update({ addOn, paid: !!addOn && choice.paid, name: choice.name || addOns.find((item) => item.id === addOn)?.name || '' })} />
        <Checkbox label={reference ? `Charge catalog price (₱${reference.amount} · ${reference.revenue_category || 'unclassified'})` : 'Charge catalog price'}
          checked={choice.paid} disabled={!reference} onChange={(paid) => update({ paid })} />
        <button type="button" className={button} onClick={() => onChange({ choices: choices.filter((item) => item.id !== choice.id) })}>Remove choice</button>
      </div>;
    })}
    <button type="button" className={button} onClick={() => onChange({ choices: [...choices, { id: uid(), name: '' }] })}>Add choice</button>
  </>;
}

export function PackageBuilderEditor({ pkg, addOns, onSaved, onClose }: {
  pkg?: Package; addOns: AddOn[]; onSaved: () => void | Promise<void>; onClose: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => initial(pkg));
  const [id, setId] = useState(pkg?.id);
  const [nextType, setNextType] = useState<PackageSection['type']>('header');
  const [preview, setPreview] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [gender, setGender] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sections = draft.builder.sections;
  const catalog = addOns.filter((item) => item.is_active !== false && !item.default_when_no_mua
    && ((item.client_kind || 'both') === 'both' || item.client_kind === draft.client_kind));
  const change = (patch: Partial<PackageDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const content = (patch: Partial<PackageDraft['builder']>) => change({ builder: { ...draft.builder, ...patch } });
  const edit = (index: number, patch: Partial<PackageSection>) =>
    content({ sections: sections.map((section, position) => position === index ? { ...section, ...patch } : section) });
  const move = (from: number, to: number) => {
    const reordered = [...sections];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    content({ sections: reordered });
  };

  async function save(publish: boolean) {
    const { builder, ...metadata } = draft;
    const { reviewNotes, ...publishedBuilder } = builder;
    metadata.code = metadata.code.trim().toUpperCase();
    metadata.name = metadata.name.trim();
    if ((!id || publish) && (!metadata.code || !metadata.name)) {
      setError('Enter a package code and title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = publish ? { ...metadata, builder: publishedBuilder, review_notes: reviewNotes || '', draft_content: null, builder_unpublished: false }
        : id ? { draft_content: draft }
          : { ...metadata, is_active: false, builder_unpublished: true, draft_content: draft };
      const saved = id ? await pb.collection('packages').update(id, payload) : await pb.collection('packages').create(payload);
      setId(saved.id);
      await onSaved();
      toast.success(publish ? 'Package published.' : 'Draft saved.');
      if (publish) onClose();
    } catch (cause) {
      const response = cause as { response?: { data?: Record<string, { message?: string }>; message?: string }; message?: string };
      setError(Object.values(response.response?.data ?? {})[0]?.message || response.response?.message || response.message || 'Unable to save the package.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Package builder" className="min-w-0 space-y-4 border-2 border-line bg-panel p-3 font-sans text-ink sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <h3 className="text-base font-black">{draft.name || 'New package'}</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={onClose}>Close</button>
        <button type="button" className={button} onClick={() => void save(false)} disabled={busy}>Save Draft</button>
        <button type="button" className={button} onClick={() => setPreview(!preview)}>{preview ? 'Edit builder' : 'Preview'}</button>
        <button type="button" className={primary} onClick={() => void save(true)} disabled={busy}>Publish Package</button>
      </div>
    </div>
    {error && <p role="alert" className="border border-red-500 p-3 text-sm font-bold text-red-500">{error}</p>}
    {preview ? <>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Preview layout"><select value={mobile ? 'mobile' : 'desktop'} className={field} onChange={(e) => setMobile(e.target.value === 'mobile')}>
          <option value="desktop">Desktop</option><option value="mobile">Mobile</option>
        </select></Field>
        <Field label="Simulated client gender"><select value={gender} className={field} onChange={(e) => { setGender(e.target.value); setPreviewKey((key) => key + 1); }}>
          <option value="">Unknown</option><option value="male">Male</option><option value="female">Female</option>
        </select></Field>
      </div>
      <div className={mobile ? 'mx-auto max-w-[390px]' : ''}>
        <PackageShowcase key={previewKey} pkg={{ ...draft, id: id || '', builder_version: 1 }} addOns={catalog} gender={gender}
          preview confirmLabel="Test confirmation" onConfirm={() => toast.success('Package choices validated in preview.')} />
      </div>
    </> : <>
      {!id && !draft.code && <Field label="Graduation brochure template">
        <select value="" className={field} onChange={(e) => {
          const template = graduationTemplates.find((entry) => entry.code === e.target.value);
          if (template) setDraft(template);
        }}>
          <option value="">Start from a brochure (optional)</option>
          {graduationTemplates.map((template) => <option value={template.code} key={template.code}>{template.name}</option>)}
        </select>
      </Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Text label="Package code" value={draft.code} onChange={(code) => change({ code })} />
        <Text label="Package title" value={draft.name} onChange={(name) => change({ name })} />
        <NumberField label="Price (₱)" step={0.01} value={draft.amount} onChange={(amount) => change({ amount: amount ?? 0 })} />
        <NumberField label="Photo selection limit (0 = unlimited)" value={draft.photo_selection_limit} onChange={(photo_selection_limit) => change({ photo_selection_limit: photo_selection_limit ?? 0 })} />
        <Field label="Offered to"><select className={field} value={draft.client_kind} onChange={(e) => change({ client_kind: e.target.value as PackageDraft['client_kind'] })}>
          <option value="school">School</option><option value="walkin">Walk-in</option><option value="both">Both</option>
        </select></Field>
        <Field label="Revenue classification"><select className={field} value={draft.revenue_category}
          onChange={(e) => change({ revenue_category: e.target.value as PackageDraft['revenue_category'], requires_mua: e.target.value === 'mua' && draft.requires_mua })}>
          <option value="">Unclassified</option><option value="studio">Studio</option><option value="mua">Other Payment — MUA</option>
        </select></Field>
        <Checkbox label="Active when published" checked={draft.is_active} onChange={(is_active) => change({ is_active })} />
        <Checkbox label="Requires Makeup / Grooming" checked={draft.requires_mua}
          disabled={draft.revenue_category !== 'mua' && !draft.requires_mua}
          onChange={(requires_mua) => change({ requires_mua })} />
        <NumberField label="Advertised print count" value={draft.builder.advertisedPrints} onChange={(advertisedPrints) => content({ advertisedPrints })} />
        <Text label="Included frame" value={draft.builder.frame} onChange={(frame) => content({ frame })} />
        <Text label="Package description" multiline value={draft.description} onChange={(description) => change({ description })} />
        <ImageField label="Cover image URL" value={draft.builder.cover} onChange={(cover) => content({ cover })} />
      </div>
      <Text label="Administrator review notes" multiline value={draft.builder.reviewNotes} onChange={(reviewNotes) => content({ reviewNotes })} />
      {sections.map((section, index) => {
        const parents = sections.slice(0, index).filter((candidate) => candidate.type === 'options');
        const parent = parents.find((candidate) => candidate.id === section.when?.section);
        return <section key={section.id} className="space-y-3 border border-line bg-canvas p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-black">{sectionTypes[section.type]}</h4>
            <div className="flex gap-1">
              <button type="button" className={button} aria-label="Move section up" disabled={index === 0} onClick={() => move(index, index - 1)}><ChevronUp size={16} /></button>
              <button type="button" className={button} aria-label="Move section down" disabled={index === sections.length - 1} onClick={() => move(index, index + 1)}><ChevronDown size={16} /></button>
              <button type="button" className={button} aria-label="Duplicate section" onClick={() => content({ sections: [...sections.slice(0, index + 1), { ...section, id: uid() }, ...sections.slice(index + 1)] })}><Copy size={16} /></button>
              <button type="button" className={button} aria-label="Delete section" onClick={() => content({ sections: sections.filter((entry) => entry.id !== section.id) })}><Trash2 size={16} /></button>
            </div>
          </div>
          <Text label="Section title" value={section.title} onChange={(title) => edit(index, { title })} />
          <Text label="Section description" multiline value={section.description} onChange={(description) => edit(index, { description })} />
          <ImageField label="Section image URL" value={section.image} onChange={(image) => edit(index, { image })} />
          <Field label="Show when"><select className={field} value={section.when?.section ?? ''} onChange={(e) => {
            const source = parents.find((candidate) => candidate.id === e.target.value);
            edit(index, { when: source ? { section: source.id, choice: source.choices?.[0]?.id ?? '' } : undefined });
          }}>
            <option value="">Always visible</option>
            {section.when && !parent && <option value={section.when.section}>Choose an earlier option section</option>}
            {parents.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title || 'Untitled options'}</option>)}
          </select></Field>
          {parent && <Field label="Matching choice"><select className={field} value={section.when?.choice}
            onChange={(e) => edit(index, { when: { section: parent.id, choice: e.target.value } })}>
            <option value="">Choose an option</option>
            {parent.choices?.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
          </select></Field>}
          <SectionRows section={section} addOns={catalog} onChange={(patch) => edit(index, patch)} />
        </section>;
      })}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Section type"><select className={field} value={nextType} onChange={(e) => setNextType(e.target.value as PackageSection['type'])}>
          {Object.entries(sectionTypes).map(([type, name]) => <option key={type} value={type}>{name}</option>)}
        </select></Field>
        <button type="button" className={button} onClick={() => content({ sections: [...sections, {
          id: uid(), type: nextType, title: '', ...(nextType === 'inclusions' ? { items: [] } : nextType === 'prints'
            ? { prints: [] } : nextType === 'options' ? { choices: [], min: 1, max: 1 } : {}),
        }] })}><Plus size={16} /> Add section</button>
      </div>
    </>}
  </section>;
}
