import React, { useMemo, useState } from 'react';
import { Gift, LayoutGrid, List, ListChecks, Package as PackageIcon, Search, X } from 'lucide-react';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import { InclusionTreeView } from '../../../components/common/InclusionTreeView';
import { Modal } from '../../../components/common/Modal';
import type { Package } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { parseInclusionTree } from '../../../utils/inclusions';
import { optionGroups } from '../../../utils/packageOptions';
import { packagePhotoUrls } from '../../../utils/packagePhotos';
import type { PackageKind } from '../useAdminData';
import { PACKAGE_KIND_LABELS } from '../packageLabels';
import { MuaRequirementBadge, RevenueBadge } from './PackageFormInputs';

type Layout = 'cards' | 'list';
type StatusFilter = 'all' | 'active' | 'archived';
type KindFilter = 'all' | 'school' | 'walkin';
type Sort = 'name' | 'code' | 'price-asc' | 'price-desc';

/** Cards are heavy (each draws its whole contents): show them a page at a time. List rows are light. */
const PAGE = { cards: 12, list: 50 } as const;
/** The chosen layout, per device. */
const LAYOUT_KEY = 'studioflow-package-catalog-layout';

function savedLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards';
  } catch {
    return 'cards';
  }
}

const isActive = (pkg: Package) => pkg.is_active !== false;
const kindOf = (pkg: Package) => (pkg.client_kind || 'school') as PackageKind;

interface PackageCatalogProps {
  packages: Package[];
  /** The package open in the builder (highlighted). */
  editingId: string | null;
  onEdit: (pkg: Package) => void;
  onDelete: (pkg: Package) => void;
  onToggleActive: (pkg: Package) => void;
}

/**
 * The admin's package list: cards (everything at a glance) or a compact list (many packages; a row opens
 * the package's details in a popup). Search, filters and sort work in both; long lists show a page at a time.
 */
export const PackageCatalog: React.FC<PackageCatalogProps> = ({ packages, editingId, onEdit, onDelete, onToggleActive }) => {
  const [layout, setLayoutState] = useState<Layout>(savedLayout);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [shown, setShown] = useState<number>(PAGE[layout]);
  const [openId, setOpenId] = useState<string | null>(null);

  const setLayout = (next: Layout) => {
    setLayoutState(next);
    setShown(PAGE[next]);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* optional */ }
  };

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = packages.filter((pkg) => {
      if (status === 'active' && !isActive(pkg)) return false;
      if (status === 'archived' && isActive(pkg)) return false;
      // A "both" package is offered to school and walk-in clients alike.
      if (kind !== 'all' && kindOf(pkg) !== kind && kindOf(pkg) !== 'both') return false;
      const text = `${pkg.code} ${pkg.name} ${pkg.tagline ?? ''}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    const byName = (a: Package, b: Package) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code);
    const compare: Record<Sort, (a: Package, b: Package) => number> = {
      name: byName,
      code: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) || byName(a, b),
      'price-asc': (a, b) => a.amount - b.amount || byName(a, b),
      'price-desc': (a, b) => b.amount - a.amount || byName(a, b),
    };
    return list.sort(compare[sort]);
  }, [packages, query, status, kind, sort]);

  // A filter change starts again from the first page.
  const resetPage = () => setShown(PAGE[layout]);
  const visible = filtered.slice(0, shown);
  const open = openId ? packages.find((pkg) => pkg.id === openId) ?? null : null;
  const activeCount = packages.filter(isActive).length;
  const filtering = Boolean(query.trim()) || status !== 'all' || kind !== 'all';

  const select = 'min-h-[34px] border border-line bg-panel px-2 text-[11px] font-bold uppercase cursor-pointer';
  const edit = (pkg: Package) => { setOpenId(null); onEdit(pkg); };

  return (
    <div className="bg-panel border-2 border-line shadow-lux p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b-2 border-line">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">Package Catalog</h3>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
            {packages.length} Packages · {activeCount} active
          </span>
          {/* How the catalog is shown, remembered on this device. */}
          <span role="radiogroup" aria-label="Show packages as" className="flex border border-line">
            {([['cards', 'Cards', LayoutGrid], ['list', 'List', List]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" role="radio" aria-checked={layout === value} onClick={() => setLayout(value)}
                className={`min-h-[32px] px-2.5 flex items-center gap-1 text-[10px] font-black uppercase cursor-pointer ${
                  layout === value ? 'bg-obsidian text-gold' : 'bg-panel text-neutral-600 hover:text-ink'}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </span>
        </span>
      </div>

      {/* Find a package: search, filters and order (shared by both layouts). */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[200px]">
          <span className="sr-only">Search packages</span>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
          <input type="search" value={query} placeholder="Search code or name…"
            onChange={(event) => { setQuery(event.target.value); resetPage(); }}
            className="w-full min-h-[34px] border border-line bg-panel pl-7 pr-2 text-xs" />
        </label>
        <select aria-label="Status" value={status} className={select}
          onChange={(event) => { setStatus(event.target.value as StatusFilter); resetPage(); }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select aria-label="Client type" value={kind} className={select}
          onChange={(event) => { setKind(event.target.value as KindFilter); resetPage(); }}>
          <option value="all">All clients</option>
          <option value="school">School</option>
          <option value="walkin">Walk-in</option>
        </select>
        <select aria-label="Sort by" value={sort} className={select} onChange={(event) => setSort(event.target.value as Sort)}>
          <option value="name">Name A–Z</option>
          <option value="code">Code</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </select>
        {filtering && (
          <button type="button" onClick={() => { setQuery(''); setStatus('all'); setKind('all'); resetPage(); }}
            className="min-h-[34px] px-2 flex items-center gap-1 border border-neutral-400 text-[10px] font-bold uppercase cursor-pointer hover:border-line">
            <X className="w-3 h-3" aria-hidden="true" /> Clear
          </button>
        )}
      </div>
      {filtering && (
        <p className="text-[11px] text-neutral-600" aria-live="polite">{filtered.length} of {packages.length} packages match.</p>
      )}

      {!filtered.length ? (
        <p className="p-6 text-center border border-dashed border-neutral-400 text-neutral-500">
          {packages.length ? 'No package matches. Change the search or filters.' : 'No packages yet. Create the first one above.'}
        </p>
      ) : layout === 'cards' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {visible.map((pkg) => (
            <div key={pkg.id} className={`p-3.5 border-2 space-y-2 ${isActive(pkg) ? 'bg-panel border-line' : 'bg-neutral-100 border-neutral-300 opacity-60'} ${
              editingId === pkg.id ? 'ring-2 ring-gold' : ''}`}>
              <PackageHeading pkg={pkg} onEdit={() => onEdit(pkg)} onDelete={() => onDelete(pkg)} onToggleActive={() => onToggleActive(pkg)} />
              <PackageDetails pkg={pkg} />
            </div>
          ))}
        </div>
      ) : (
        <PackageRows packages={visible} editingId={editingId} onOpen={(pkg) => setOpenId(pkg.id)}
          onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} />
      )}

      {filtered.length > visible.length && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <span className="text-[11px] text-neutral-600">Showing {visible.length} of {filtered.length}</span>
          <button type="button" onClick={() => setShown((count) => count + PAGE[layout])}
            className="btn-tactile min-h-[34px] px-3 border border-line text-[10px] font-black uppercase cursor-pointer hover:bg-gold-wash">
            Show {Math.min(PAGE[layout], filtered.length - visible.length)} more
          </button>
          <button type="button" onClick={() => setShown(filtered.length)}
            className="min-h-[34px] px-3 text-[10px] font-bold uppercase underline cursor-pointer">
            Show all
          </button>
        </div>
      )}

      {/* A list row's details: everything a card shows, with the photos and the same actions. */}
      {open && (
        <Modal title={open.name} subtitle={`${open.code} · ${formatCurrency(open.amount)}`} icon={PackageIcon} size="lg" onClose={() => setOpenId(null)}
          footer={(
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ActiveToggle pkg={open} onToggle={() => onToggleActive(open)} />
              <span className="flex gap-2">
                <button type="button" onClick={() => onDelete(open)}
                  className="btn-tactile min-h-[38px] px-3 border border-red-600 text-red-600 text-[11px] font-black uppercase cursor-pointer">
                  Delete
                </button>
                <button type="button" onClick={() => edit(open)}
                  className="btn-tactile min-h-[38px] px-4 bg-obsidian text-gold border border-line text-[11px] font-black uppercase cursor-pointer">
                  Edit package
                </button>
              </span>
            </div>
          )}>
          <div className="space-y-3 font-mono text-xs">
            <PackagePhotos pkg={open} />
            {open.tagline && <p className="font-sans text-sm text-neutral-600">{open.tagline}</p>}
            <PackageDetails pkg={open} />
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Code, name, price, cover photo, Active switch, Edit / Delete: the top of a card. */
const PackageHeading: React.FC<{ pkg: Package; onEdit: () => void; onDelete: () => void; onToggleActive: () => void }> = ({
  pkg, onEdit, onDelete, onToggleActive,
}) => {
  const [cover] = packagePhotoUrls(pkg, 'card');
  return (
    <div className="flex justify-between items-start gap-2">
      <Cover src={cover} className="w-16 h-12" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-black bg-obsidian text-gold px-1.5 py-0.5 uppercase">{pkg.code}</span>
          <span className="font-bold text-sm text-ink uppercase">{pkg.name}</span>
        </div>
        <div className="font-mono text-sm font-black text-gold-soft mt-1">{formatCurrency(pkg.amount)}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <ActiveToggle pkg={pkg} onToggle={onToggleActive} />
        <span className={recordActionGroup}>
          <RecordActionButton variant="edit" recordName={pkg.name} onClick={onEdit} />
          <RecordActionButton variant="delete" recordName={pkg.name} onClick={onDelete} />
        </span>
      </div>
    </div>
  );
};

/** Badges, contents, options and freebies: the body of a card, and of a list row's popup. */
const PackageDetails: React.FC<{ pkg: Package }> = ({ pkg }) => {
  const freebies = parsePackageInclusions(pkg.freebies);
  return (
    <>
      <div className="flex flex-wrap gap-1">
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400">{PACKAGE_KIND_LABELS[kindOf(pkg)]}</span>
        <MuaRequirementBadge required={pkg.requires_mua} revenue={pkg.revenue_category} />
        <RevenueBadge value={pkg.revenue_category} />
        {!pkg.structure && <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-amber-500 text-amber-800">Not built yet: open to build</span>}
      </div>
      <InclusionTreeView inclusions={parseInclusionTree(pkg.inclusions)} variant="compact" />
      {optionGroups(pkg).map((g) => (
        <div key={g.id} className="flex flex-wrap items-center gap-1 text-[10px]">
          <ListChecks className="w-3 h-3 text-gold" />
          <b className="uppercase">{g.name}:</b>
          {g.replaces && <span>keep {g.replaces}{g.replaces_for && g.replaces_for !== 'all' ? ` (${g.replaces_for} only)` : ''} or</span>}
          {g.choices.map((c) => <span key={c.id} className="px-1.5 border border-neutral-400">{c.label}{c.for !== 'all' ? ` · ${c.for}` : ''}</span>)}
        </div>
      ))}
      {freebies.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft"><Gift className="w-3 h-3" /> Freebies:</span>
          {freebies.map((item, i) => <span key={i} className="px-2 py-0.5 text-[10px] border border-gold text-gold-soft">{item}</span>)}
        </div>
      )}
    </>
  );
};

/** The compact list: one row per package; clicking a row opens its details. */
const PackageRows: React.FC<{
  packages: Package[];
  editingId: string | null;
  onOpen: (pkg: Package) => void;
  onEdit: (pkg: Package) => void;
  onDelete: (pkg: Package) => void;
  onToggleActive: (pkg: Package) => void;
}> = ({ packages, editingId, onOpen, onEdit, onDelete, onToggleActive }) => (
  <div className="overflow-x-auto border border-line">
    <table className="w-full min-w-[720px] border-collapse text-xs">
      <thead>
        <tr className="bg-obsidian text-gold text-left text-[10px] uppercase tracking-wider">
          <th className="p-2 w-14"><span className="sr-only">Photo</span></th>
          <th className="p-2">Code</th>
          <th className="p-2">Package</th>
          <th className="p-2 text-right">Price</th>
          <th className="p-2">Clients</th>
          <th className="p-2">Revenue</th>
          <th className="p-2">Status</th>
          <th className="p-2 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {packages.map((pkg) => {
          const [cover] = packagePhotoUrls(pkg, 'card');
          return (
            <tr key={pkg.id} onClick={() => onOpen(pkg)}
              className={`border-t border-line cursor-pointer hover:bg-gold-wash ${isActive(pkg) ? '' : 'opacity-60'} ${
                editingId === pkg.id ? 'outline-2 outline-gold -outline-offset-2' : ''}`}>
              <td className="p-1.5"><Cover src={cover} className="w-12 h-9" /></td>
              <td className="p-2 font-black text-gold-soft uppercase whitespace-nowrap">{pkg.code}</td>
              <td className="p-2">
                {/* The name is the keyboard way in: a button that opens the details. */}
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(pkg); }}
                  className="text-left font-bold uppercase text-ink hover:underline cursor-pointer">
                  {pkg.name}
                </button>
                {!pkg.structure && <span className="ml-2 text-[9px] font-bold uppercase text-amber-700">Not built yet</span>}
              </td>
              <td className="p-2 text-right font-black text-gold-soft whitespace-nowrap">{formatCurrency(pkg.amount)}</td>
              <td className="p-2 text-[10px] uppercase whitespace-nowrap">{PACKAGE_KIND_LABELS[kindOf(pkg)]}</td>
              <td className="p-2"><RevenueBadge value={pkg.revenue_category} /></td>
              {/* The controls work on their own, without opening the details. */}
              <td className="p-2" onClick={(event) => event.stopPropagation()}>
                <ActiveToggle pkg={pkg} onToggle={() => onToggleActive(pkg)} />
              </td>
              <td className="p-2" onClick={(event) => event.stopPropagation()}>
                <span className={`${recordActionGroup} justify-end`}>
                  <RecordActionButton variant="edit" recordName={pkg.name} onClick={() => onEdit(pkg)} />
                  <RecordActionButton variant="delete" recordName={pkg.name} onClick={() => onDelete(pkg)} />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const ActiveToggle: React.FC<{ pkg: Package; onToggle: () => void }> = ({ pkg, onToggle }) => (
  <button type="button" onClick={onToggle} title={isActive(pkg) ? 'Offered at the kiosk: click to archive' : 'Archived: click to offer it again'}
    className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${isActive(pkg)
      ? 'bg-emerald-100 text-emerald-800 border-emerald-400' : 'bg-neutral-200 text-neutral-600 border-neutral-400'}`}>
    {isActive(pkg) ? 'Active' : 'Archived'}
  </button>
);

const Cover: React.FC<{ src?: string; className: string }> = ({ src, className }) => (src
  ? <img src={src} alt="" loading="lazy" className={`${className} shrink-0 object-cover border border-line`} />
  : <span className={`${className} shrink-0 flex items-center justify-center border border-dashed border-neutral-400 text-[8px] font-black uppercase text-neutral-500 text-center leading-tight`}>No photo</span>);

/** The package's photos in the details popup (flyer first), small. */
const PackagePhotos: React.FC<{ pkg: Package }> = ({ pkg }) => {
  const photos = packagePhotoUrls(pkg, 'card');
  if (!photos.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {photos.map((src, index) => (
        <img key={src} src={src} alt={index ? `Sample ${index}` : 'Flyer'} loading="lazy" className="h-28 shrink-0 object-cover border border-line" />
      ))}
    </div>
  );
};
