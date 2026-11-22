import React, { useState } from 'react';
import { Plus, Sparkles, Gift, Package as PackageIcon, Layers, Box, ListChecks, FileSpreadsheet, FileText, FileDown, Loader2 } from 'lucide-react';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import type { Package, AddOn, RevenueCategory, CatalogItem, CatalogItemInput, ItemPackage } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { parseInclusionTree } from '../../../utils/inclusions';
import { optionGroups } from '../../../utils/packageOptions';
import { InclusionTreeView } from '../../../components/common/InclusionTreeView';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { Modal } from '../../../components/common/Modal';
import { useToast } from '../../../context/ToastContext';
import type { PackageBuilderData, PackageKind } from '../useAdminData';
import { PACKAGE_KIND_LABELS, addOnKind, revenueLabels } from '../packageLabels';
import { DefaultAddOnInput, MuaRequirementBadge, MuaRequirementInput, PackageKindInput, RevenueInput } from './PackageFormInputs';
import { PackageBuilder } from './PackageBuilder';
import { ItemPackagesPanel } from './ItemPackagesPanel';
import { CatalogItemsPanel } from './CatalogItemsPanel';
import { packagePhotoUrls } from '../../../utils/packagePhotos';

type View = 'packages' | 'sets' | 'items' | 'addons';

interface AdminPackagesTabProps {
  packages: Package[];
  addOns: AddOn[];
  catalogItems: CatalogItem[];
  itemPackages: ItemPackage[];
  onSavePackage: (id: string | null, data: PackageBuilderData) => Promise<void>;
  onTogglePackageActive: (id: string, current: boolean) => Promise<void>;
  onDeletePackage: (id: string) => Promise<void>;
  onSaveCatalogItem: (id: string | null, data: CatalogItemInput) => Promise<CatalogItem>;
  onDeleteCatalogItem: (id: string) => Promise<void>;
  onSaveItemPackage: (id: string | null, data: { name: string; items: ItemPackage['items'] }) => Promise<ItemPackage>;
  onDeleteItemPackage: (id: string) => Promise<void>;
  onAddAddOn: (name: string, code: string, amount: number, requiresMua: boolean, clientKind: PackageKind, revenue: RevenueCategory | '', defaultWhenNoMua: boolean) => Promise<void>;
  onUpdateAddOn: (id: string, name: string, code: string, amount: number, requiresMua: boolean, clientKind: PackageKind, revenue: RevenueCategory | '', defaultWhenNoMua: boolean) => Promise<void>;
  onToggleAddOnActive: (id: string, current: boolean) => Promise<void>;
  onDeleteAddOn: (id: string) => Promise<void>;
}

const TABS: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'packages', label: '③ Packages', icon: PackageIcon },
  { id: 'sets', label: '② Saved Poses', icon: Layers },
  { id: 'items', label: '① Single Items', icon: Box },
  { id: 'addons', label: 'Add-ons', icon: Sparkles },
];

export const AdminPackagesTab: React.FC<AdminPackagesTabProps> = ({
  packages,
  addOns,
  catalogItems,
  itemPackages,
  onSavePackage,
  onTogglePackageActive,
  onDeletePackage,
  onSaveCatalogItem,
  onDeleteCatalogItem,
  onSaveItemPackage,
  onDeleteItemPackage,
  onAddAddOn,
  onUpdateAddOn,
  onToggleAddOnActive,
  onDeleteAddOn,
}) => {
  const { toast } = useToast();
  const [view, setView] = useState<View>('packages');
  /** The package open in the builder: a package, 'new', or none. */
  const [building, setBuilding] = useState<Package | 'new' | null>(null);

  // Add-on Form State
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonCode, setNewAddonCode] = useState('');
  const [newAddonAmount, setNewAddonAmount] = useState(250);
  const [newAddonRequiresMua, setNewAddonRequiresMua] = useState(false);
  const [newAddonRevenue, setNewAddonRevenue] = useState<RevenueCategory | ''>('studio');
  const [newAddonDefault, setNewAddonDefault] = useState(false);
  const [newAddonKind, setNewAddonKind] = useState<PackageKind>('both');

  // Editing Add-on State
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [editAddonName, setEditAddonName] = useState('');
  const [editAddonCode, setEditAddonCode] = useState('');
  const [editAddonAmount, setEditAddonAmount] = useState(0);
  const [editAddonRequiresMua, setEditAddonRequiresMua] = useState(false);
  const [editAddonRevenue, setEditAddonRevenue] = useState<RevenueCategory | ''>('');
  const [editAddonDefault, setEditAddonDefault] = useState(false);
  const [editAddonKind, setEditAddonKind] = useState<PackageKind>('both');

  // Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const startEditAddon = (add: AddOn) => {
    setEditingAddonId(add.id);
    setEditAddonName(add.name);
    setEditAddonCode(add.code || '');
    setEditAddonAmount(add.amount);
    setEditAddonRequiresMua(!!add.requires_mua);
    setEditAddonRevenue(add.revenue_category || '');
    setEditAddonDefault(!!add.default_when_no_mua);
    setEditAddonKind(addOnKind(add));
  };

  const handleSaveAddonEdit = async () => {
    if (!editingAddonId) return;
    try {
      await onUpdateAddOn(editingAddonId, editAddonName, editAddonCode, editAddonAmount,
        editAddonRequiresMua, editAddonKind, editAddonRevenue, editAddonDefault);
      toast.success(`Add-on "${editAddonName}" updated successfully`);
      setEditingAddonId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update add-on');
    }
  };

  const handleCreateAddon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddonName.trim()) return;
    try {
      await onAddAddOn(newAddonName, newAddonCode, newAddonAmount,
        newAddonRequiresMua, newAddonKind, newAddonRevenue, newAddonDefault);
      toast.success(`Add-on "${newAddonName}" added to catalog`);
      setNewAddonName('');
      setNewAddonCode('');
      setNewAddonAmount(250);
      setNewAddonRequiresMua(false);
      setNewAddonRevenue('studio');
      setNewAddonDefault(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create add-on');
    }
  };

  const promptDeleteAddOn = (add: AddOn) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Add-On: ${add.name}`,
      message: `Are you sure you want to permanently delete the add-on item "${add.name}"?`,
      action: async () => {
        try {
          await onDeleteAddOn(add.id);
          toast.success(`Add-on "${add.name}" deleted`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete add-on');
        }
      },
    });
  };

  const promptDeletePackage = (pkg: Package) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Package: ${pkg.code}`,
      message: `Are you sure you want to permanently delete package "${pkg.name}" (${pkg.code})? Job orders already sold keep their recorded package; it will no longer be offered for new registrations.`,
      action: async () => {
        try {
          await onDeletePackage(pkg.id);
          toast.success(`Package ${pkg.code} deleted`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete package');
        }
      },
    });
  };

  // Price list: single items, packages (and what is in them) and add-ons, as a file.
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | 'docx' | null>(null);
  const exportPriceList = async (format: 'xlsx' | 'csv' | 'docx') => {
    setExporting(format);
    try {
      const { downloadPriceList } = await import('../priceListExport');
      await downloadPriceList({ items: catalogItems, packages, addOns, poses: itemPackages }, format);
      toast.success('Price list downloaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The price list could not be made.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 animate-enter font-mono text-xs">
      <div role="tablist" aria-label="Packages and add-ons" className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-1.5 bg-panel border-2 border-line">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => setView(tab.id)}
            className={`btn-tactile min-h-[42px] flex items-center justify-center gap-2 border text-[11px] font-black uppercase tracking-wider cursor-pointer ${
              view === tab.id ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300 hover:border-line'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-panel border border-line">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-ink">
          <FileDown className="w-4 h-4 text-gold" /> Export price list
          <span className="font-sans normal-case font-normal text-neutral-500 tracking-normal">Single items, packages with their contents, and add-ons. Each file is also a backup: Import from File restores the catalog from it.</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {([['xlsx', 'Excel', FileSpreadsheet], ['csv', 'CSV', FileText], ['docx', 'Word', FileText]] as const).map(([format, label, Icon]) => (
            <button key={format} type="button" disabled={!!exporting} onClick={() => void exportPriceList(format)}
              className="btn-tactile min-h-[34px] px-3 flex items-center gap-1.5 border border-gold text-gold-soft text-[10px] font-black uppercase cursor-pointer hover:bg-gold-wash disabled:opacity-50">
              {exporting === format ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />} {label}
            </button>
          ))}
        </span>
      </div>

      {view === 'packages' && (
        <div className="space-y-4">
          {building && (
            <PackageBuilder key={building === 'new' ? 'new' : building.id} items={catalogItems} sets={itemPackages} packages={packages}
              pkg={building === 'new' ? null : building} onSave={onSavePackage} onSaveItem={onSaveCatalogItem} onSavePose={onSaveItemPackage}
              onClose={() => setBuilding(null)} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-panel border-2 border-line shadow-lux">
            <p className="font-sans text-xs text-neutral-600 max-w-2xl">
              Build a package from <b>poses</b> (each with its own sizes and quantities), the frame, unlimited shots, exchanges and freebies.
              Start from a <b>saved pose</b> or <b>copy another package</b> and change what differs.
            </p>
            <button type="button" onClick={() => setBuilding('new')}
              className="btn-tactile flex items-center gap-1.5 px-4 py-2.5 bg-obsidian text-gold border border-line font-black uppercase tracking-widest cursor-pointer">
              <Plus className="w-4 h-4" /> Create package
            </button>
          </div>

          <div className="bg-panel border-2 border-line shadow-lux p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b-2 border-line">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">Package Catalog</h3>
              <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">{packages.length} Packages</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {packages.map((pkg) => {
                const freebies = parsePackageInclusions(pkg.freebies);
                const [cover] = packagePhotoUrls(pkg, 'card');
                return (
                  <div key={pkg.id} className={`p-3.5 border-2 space-y-2 ${pkg.is_active !== false ? 'bg-panel border-line' : 'bg-neutral-100 border-neutral-300 opacity-60'} ${
                    building !== 'new' && building?.id === pkg.id ? 'ring-2 ring-gold' : ''}`}>
                    <div className="flex justify-between items-start gap-2">
                      {cover
                        ? <img src={cover} alt="" loading="lazy" className="w-16 h-12 shrink-0 object-cover border border-line" />
                        : <span className="w-16 h-12 shrink-0 flex items-center justify-center border border-dashed border-neutral-400 text-[8px] font-black uppercase text-neutral-500 text-center leading-tight">No photo</span>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black bg-obsidian text-gold px-1.5 py-0.5 uppercase">{pkg.code}</span>
                          <span className="font-bold text-sm text-ink uppercase">{pkg.name}</span>
                        </div>
                        <div className="font-mono text-sm font-black text-gold-soft mt-1">{formatCurrency(pkg.amount)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button type="button" onClick={() => onTogglePackageActive(pkg.id, pkg.is_active !== false)}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${pkg.is_active !== false
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-400' : 'bg-neutral-200 text-neutral-600 border-neutral-400'}`}>
                          {pkg.is_active !== false ? 'Active' : 'Archived'}
                        </button>
                        <span className={recordActionGroup}>
                          <RecordActionButton variant="edit" recordName={pkg.name} onClick={() => { setBuilding(pkg); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
                          <RecordActionButton variant="delete" recordName={pkg.name} onClick={() => promptDeletePackage(pkg)} />
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400">{PACKAGE_KIND_LABELS[(pkg.client_kind || 'school') as PackageKind]}</span>
                      <MuaRequirementBadge required={pkg.requires_mua} revenue={pkg.revenue_category} />
                      <span className="text-[10px] font-bold uppercase">{revenueLabels[pkg.revenue_category || '']}</span>
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
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {view === 'sets' && (
        <ItemPackagesPanel items={catalogItems} sets={itemPackages} onSave={onSaveItemPackage} onDelete={onDeleteItemPackage} onSaveItem={onSaveCatalogItem} />
      )}

      {view === 'items' && (
        <CatalogItemsPanel items={catalogItems} onSave={onSaveCatalogItem} onDelete={onDeleteCatalogItem} />
      )}

      {view === 'addons' && (
            <div className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-3 border-b-2 border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" />
            <span>Add-Ons &amp; Upgrades</span>
          </div>
          <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
            {addOns.filter((add) => !add.catalog_item).length} Items
          </span>
        </h3>

        {/* Create Add-on Form */}
        <form
          onSubmit={handleCreateAddon}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-canvas border border-line"
        >
          <div>
            <label className="block text-[10px] font-black uppercase text-neutral-600 mb-1">
              Add-On Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Extra 8R Frame"
              value={newAddonName}
              onChange={(e) => setNewAddonName(e.target.value)}
              className="w-full p-2 border border-neutral-400 bg-panel font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-neutral-600 mb-1">
              Code (Optional)
            </label>
            <input
              type="text"
              placeholder="ADD-8R"
              value={newAddonCode}
              onChange={(e) => setNewAddonCode(e.target.value)}
              className="w-full p-2 border border-neutral-400 bg-panel uppercase font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-neutral-600 mb-1">
              Amount (₱) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0"
              value={newAddonAmount}
              onChange={(e) => setNewAddonAmount(Number(e.target.value))}
              className="w-full p-2 border border-neutral-400 bg-panel font-black"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="btn-tactile w-full py-2.5 bg-obsidian text-gold font-black uppercase flex items-center justify-center gap-1 cursor-pointer min-h-[38px]"
            >
              <Plus className="w-4 h-4" /> Add to Catalog
            </button>
          </div>
          <div className="sm:col-span-2">
            <PackageKindInput value={newAddonKind} onChange={setNewAddonKind} />
          </div>
          <div className="sm:col-span-4">
            <RevenueInput value={newAddonRevenue} onChange={(value) => {
              setNewAddonRevenue(value);
              if (value !== 'mua') setNewAddonRequiresMua(false);
            }} />
            <MuaRequirementInput checked={newAddonRequiresMua} onChange={(checked) => {
              setNewAddonRequiresMua(checked);
              if (checked) setNewAddonDefault(false);
            }}
              revenue={newAddonRevenue} amount={newAddonAmount} />
            <DefaultAddOnInput checked={newAddonDefault} onChange={(checked) => {
              setNewAddonDefault(checked);
              if (checked) setNewAddonRequiresMua(false);
            }} disabled={newAddonRevenue !== 'mua'} />
          </div>
        </form>

        {/* Add-on List Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {addOns.filter((add) => !add.catalog_item).map((add) => (
            <div
              key={add.id}
              className={`p-3 border-2 flex flex-wrap justify-between items-center gap-2 ${
                add.is_active !== false
                  ? 'bg-panel border-line'
                  : 'bg-neutral-100 border-neutral-300 opacity-60'
              }`}
            >
                <>
                  <div>
                    <span className="font-bold text-ink uppercase block">{add.name}</span>
                    <span className="font-mono font-black text-gold-soft">
                      +{formatCurrency(add.amount)}
                    </span>
                    {add.code && (
                      <span className="text-[10px] text-neutral-500 ml-2">({add.code})</span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <MuaRequirementBadge required={add.requires_mua} revenue={add.revenue_category} />
                      {add.default_when_no_mua && <span className="border border-gold bg-gold-wash px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft">Default service — confirmation required</span>}
                      <span className="text-[10px] font-bold uppercase">{revenueLabels[add.revenue_category || '']}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400">{PACKAGE_KIND_LABELS[addOnKind(add)]}</span>
                    </div>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAddOnActive(add.id, add.is_active !== false)}
                      className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border cursor-pointer ${
                        add.is_active !== false
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {add.is_active !== false ? 'Active' : 'Off'}
                    </button>
                    <span className={recordActionGroup}>
                      <RecordActionButton variant="edit" recordName={add.name} onClick={() => startEditAddon(add)} />
                      <RecordActionButton variant="delete" recordName={add.name} onClick={() => promptDeleteAddOn(add)} />
                    </span>
                  </div>
                </>
              {editingAddonId === add.id && (
                <Modal title="Edit add-on" subtitle={add.name} icon={Sparkles} size="md" onClose={() => setEditingAddonId(null)}>
                <div className="space-y-3 w-full">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                      Add-On Item Name
                    </label>
                    <input
                      type="text"
                      value={editAddonName}
                      onChange={(e) => setEditAddonName(e.target.value)}
                      className="w-full p-1.5 border border-line bg-panel font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                        Code
                      </label>
                      <input
                        type="text"
                        value={editAddonCode}
                        onChange={(e) => setEditAddonCode(e.target.value)}
                        className="w-full p-1 border border-line uppercase bg-panel font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                        Amount (₱)
                      </label>
                      <input
                        type="number"
                        value={editAddonAmount}
                        onChange={(e) => setEditAddonAmount(Number(e.target.value))}
                        className="w-full p-1 border border-line bg-panel font-black"
                      />
                    </div>
                  </div>
                  <PackageKindInput value={editAddonKind} onChange={setEditAddonKind} />
                  <RevenueInput value={editAddonRevenue} onChange={(value) => {
                    setEditAddonRevenue(value);
                    if (value !== 'mua') setEditAddonRequiresMua(false);
                  }} />
                  <MuaRequirementInput checked={editAddonRequiresMua} onChange={(checked) => {
                    setEditAddonRequiresMua(checked);
                    if (checked) setEditAddonDefault(false);
                  }}
                    revenue={editAddonRevenue} amount={editAddonAmount} />
                  <DefaultAddOnInput checked={editAddonDefault} onChange={(checked) => {
                    setEditAddonDefault(checked);
                    if (checked) setEditAddonRequiresMua(false);
                  }} disabled={editAddonRevenue !== 'mua'} />
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingAddonId(null)}
                      className="btn-tactile px-2.5 py-1 bg-panel border border-line font-bold uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddonEdit}
                      className="btn-tactile px-3 py-1 bg-obsidian text-gold font-black uppercase border border-line cursor-pointer"
                    >
                      ✓ Save
                    </button>
                  </div>
                </div>
                </Modal>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText="Confirm Delete"
        isDestructive={true}
        onConfirm={confirmModalState.action}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
