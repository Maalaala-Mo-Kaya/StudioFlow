import { useState } from 'react';
import type { AddOn, Package } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { configurationErrors, definition, resolveAnswers, visible, type PackageAnswers, type PackageConfiguration } from './packageBuilder';

export function PackageImage({ src, alt = '', className = '' }: { src?: string; alt?: string; className?: string }) {
  if (!src || !/^(?:\/[^/]|https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(src)) return null;
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

export function PackageShowcase({ pkg, addOns, gender, value, onConfirm, confirmLabel = 'Confirm package', preview = false }: {
  pkg: Package;
  addOns: AddOn[];
  gender: string;
  value?: PackageConfiguration;
  onConfirm: (configuration: PackageConfiguration) => void;
  confirmLabel?: string;
  preview?: boolean;
}) {
  const builder = definition(pkg);
  const [draft, setDraft] = useState<PackageAnswers>(() => value?.version === (pkg.builder_version ?? 0) ? value.answers : {});
  const [submitted, setSubmitted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const answers = resolveAnswers(builder, draft, gender, true);
  const errors = configurationErrors(builder, answers);
  const matched = builder.sections.flatMap((section) => (section.choices ?? [])
    .filter((choice) => answers[section.id]?.includes(choice.id)).map((choice) => ({ section, choice })));
  const items = new Map<string, number>();
  const unavailable = new Set<string>();
  for (const { section, choice } of matched) {
    if (!choice.addOn) continue;
    const item = addOns.find((entry) => entry.id === choice.addOn && entry.is_active !== false && !entry.default_when_no_mua);
    if (!item) unavailable.add(section.id);
    else if (!items.has(item.id) || !choice.paid) items.set(item.id, choice.paid ? item.amount : 0);
  }
  const adjustment = [...items.values()].reduce((sum, amount) => sum + Math.round(amount * 100), 0) / 100;
  const configurable = builder.sections.some((section) => section.type === 'options');

  function update(section: string, selection: string[]) {
    const next = { ...answers, [section]: selection };
    const visibleAnswers = resolveAnswers(builder, next);
    setDraft(Object.fromEntries(Object.entries(next).filter(([id]) => Object.hasOwn(visibleAnswers, id))));
    setReviewing(false);
  }

  function confirm() {
    setSubmitted(true);
    if (Object.keys(errors).length || unavailable.size) return;
    if (configurable && !reviewing) {
      setReviewing(true);
      return;
    }
    onConfirm({ version: pkg.builder_version ?? 0, answers });
  }

  return (
    <div className="@container min-w-0 space-y-4 font-sans">
      <PackageImage src={builder.cover} alt={pkg.name} className="max-h-72 w-full border border-line object-contain bg-canvas" />
      {pkg.description && <p className="whitespace-pre-wrap text-sm">{pkg.description}</p>}
      {(!!pkg.photo_selection_limit || builder.advertisedPrints !== undefined || builder.frame) && (
        <ul className="flex flex-wrap gap-2 text-xs font-bold text-gold-soft">
          {!!pkg.photo_selection_limit && <li className="border border-line bg-canvas px-2 py-1">{pkg.photo_selection_limit} photos to select</li>}
          {builder.advertisedPrints !== undefined && <li className="border border-line bg-canvas px-2 py-1">{builder.advertisedPrints} advertised prints</li>}
          {builder.frame && <li className="border border-line bg-canvas px-2 py-1">{builder.frame}</li>}
        </ul>
      )}
      {preview && builder.reviewNotes && <p className="border border-gold bg-gold-wash p-3 text-sm whitespace-pre-wrap">{builder.reviewNotes}</p>}
      {builder.sections.filter((section) => visible(section, answers)).map((section) => {
        const chosen = answers[section.id] ?? [];
        const max = section.max ?? 1;
        const min = section.min ?? 0;
        const includedPrints = section.prints?.filter((row) => !row.alternative).reduce((total, row) => total + row.quantity, 0);
        return (
          <section key={section.id} className="space-y-2 border border-line bg-panel p-3 sm:p-4">
            <h4 className="text-sm font-black text-ink">{section.title}</h4>
            {section.description && <p className="whitespace-pre-wrap text-sm">{section.description}</p>}
            <PackageImage src={section.image} className="max-h-56 w-full object-contain" />
            {section.type === 'inclusions' && <ul className="divide-y divide-line">
              {section.items?.map((item, index) => <li key={index} className="flex gap-2 py-2 text-sm">
                <PackageImage src={item.image} className="size-12 shrink-0 object-cover" />
                <div><p className="font-bold">{item.quantity ? `${item.quantity} × ` : ''}{item.name}</p>
                  {item.description && <p className="whitespace-pre-wrap text-xs">{item.description}</p>}</div>
              </li>)}
            </ul>}
            {section.type === 'prints' && <>
              <ul className="divide-y divide-line text-sm">
                {section.prints?.map((row, index) => <li key={index} className="py-2">
                  <p><strong>{row.quantity} × {row.size}</strong> · {row.pose}</p>
                  {row.alternative && <p className="text-xs text-gold-soft">Alternative · {row.alternative}</p>}
                  {row.notes && <p className="text-xs">{row.notes}</p>}
                </li>)}
              </ul>
              {!!includedPrints && <p className="text-xs font-bold">{includedPrints} included prints listed</p>}
            </>}
            {section.type === 'options' && <fieldset className="min-w-0 space-y-2">
              <legend className="pb-2 text-xs font-bold text-gold-soft">{min === max ? `Select exactly ${min}` : min ? `Select ${min}–${max}` : `Optional · select up to ${max}`}</legend>
              {section.display === 'dropdown' && max === 1 ? (
                <select aria-label={section.title} className="w-full border border-line bg-canvas p-2" value={chosen[0] ?? ''}
                  onChange={(event) => update(section.id, event.target.value ? [event.target.value] : [])}>
                  <option value="">Choose an option</option>
                  {section.choices?.map((choice) => {
                    const item = addOns.find((entry) => entry.id === choice.addOn);
                    const recommended = choice.recommendation === 'any' || (!!gender && choice.recommendation === gender);
                    return <option key={choice.id} value={choice.id}>{choice.name}{recommended ? ' · Recommended' : ''}{choice.paid && item ? ` · +${formatCurrency(item.amount)}` : ''}</option>;
                  })}
                </select>
              ) : (
                <div className={section.display === 'cards' ? 'grid grid-cols-1 gap-2 @min-[32rem]:grid-cols-2' : 'grid gap-2'}>
                  {section.choices?.map((choice) => {
                    const picked = chosen.includes(choice.id);
                    const item = addOns.find((entry) => entry.id === choice.addOn);
                    const recommended = choice.recommendation === 'any' || (!!gender && choice.recommendation === gender);
                    return <label key={choice.id} className={`flex cursor-pointer items-start gap-2 border p-3 ${picked ? 'border-gold bg-gold-wash' : 'border-line bg-canvas'}`}>
                      <input type={max === 1 ? 'radio' : 'checkbox'} name={section.id} checked={picked} className="mt-1 accent-gold"
                        disabled={max !== 1 && !picked && chosen.length >= max}
                        onChange={() => update(section.id, max === 1 ? [choice.id] : picked ? chosen.filter((id) => id !== choice.id) : [...chosen, choice.id])} />
                      <span className="min-w-0 space-y-1 text-sm">
                        <PackageImage src={choice.image} className="max-h-32 w-full object-contain" />
                        <strong className="block">{choice.name}</strong>
                        {choice.description && <span className="block text-xs">{choice.description}</span>}
                        {recommended && <span className="block text-xs font-bold text-gold-soft">Recommended</span>}
                        {choice.paid && <span className="block text-xs font-bold">{item ? `+${formatCurrency(item.amount)}` : 'Unavailable'}</span>}
                      </span>
                    </label>;
                  })}
                </div>
              )}
              {!min && max === 1 && chosen.length > 0 && section.display !== 'dropdown' && <button type="button" onClick={() => update(section.id, [])} className="text-xs font-bold underline">Clear selection</button>}
              {submitted && (errors[section.id] || unavailable.has(section.id)) && <p role="alert" className="text-sm font-bold text-red-500">{errors[section.id] || 'A selected add-on is unavailable.'}</p>}
            </fieldset>}
          </section>
        );
      })}
      {reviewing && <section aria-label="Configured package summary" className="space-y-2 border border-gold bg-gold-wash p-3">
        <h4 className="font-bold">Your package summary</h4>
        {matched.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-sm">
          {matched.map(({ section, choice }) => <li key={section.id + ':' + choice.id}>{section.title} · {choice.name}</li>)}
        </ul> : <p className="text-sm">No optional choices selected.</p>}
      </section>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div><p className="text-xs">Package total{adjustment > 0 && ` · ${formatCurrency(adjustment)} in paid choices`}</p>
          <strong className="text-lg text-gold-soft">{formatCurrency(pkg.amount + adjustment, { exact: true })}</strong></div>
        <button type="button" className="min-h-11 border border-gold bg-gold px-4 text-xs font-black uppercase text-on-gold" onClick={confirm}>
          {configurable && !reviewing ? 'Review choices' : confirmLabel}
        </button>
      </div>
    </div>
  );
}
