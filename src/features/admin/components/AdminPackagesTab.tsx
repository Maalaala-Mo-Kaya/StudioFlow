import React, { useState } from 'react';
import { Plus, Sparkles, Gift } from 'lucide-react';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import type { Package, AddOn, RevenueCategory } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { PackageBuilderEditor } from '../../packages/PackageBuilderEditor';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import type { PackageKind } from '../useAdminData';

interface AdminPackagesTabProps {
  packages: Package[];
  addOns: AddOn[];
  onPackagesSaved: () => void | Promise<void>;
  onTogglePackageActive: (id: string, current: boolean) => Promise<void>;
  onDeletePackage: (id: string) => Promise<void>;
  onAddAddOn: (name: string, code: string, amount: number, requiresMua: boolean, clientKind: PackageKind, revenue: RevenueCategory | '', defaultWhenNoMua: boolean) => Promise<void>;
  onUpdateAddOn: (id: string, name: string, code: string, amount: number, requiresMua: boolean, clientKind: PackageKind, revenue: RevenueCategory | '', defaultWhenNoMua: boolean) => Promise<void>;
  onToggleAddOnActive: (id: string, current: boolean) => Promise<void>;
  onDeleteAddOn: (id: string) => Promise<void>;
}

export const AdminPackagesTab: React.FC<AdminPackagesTabProps> = ({
  packages,
  addOns,
  onPackagesSaved,
  onTogglePackageActive,
  onDeletePackage,
  onAddAddOn,
  onUpdateAddOn,
  onToggleAddOnActive,
  onDeleteAddOn,
}) => {
  const { toast } = useToast();

  const [builder, setBuilder] = useState<Package | 'new' | null>(null);

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

  const promptDeletePackage = (pkg: Package) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Package: ${pkg.code}`,
      message: `Are you sure you want to permanently delete package "${pkg.name}" (${pkg.code})? Any historical registrations using this package will retain their recorded amounts, but it will no longer be available for new registrations.`,
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

  return (
    <div className="space-y-8 animate-enter font-mono text-xs">
      {builder && <PackageBuilderEditor key={builder === "new" ? "new" : builder.id}
        pkg={builder === "new" ? undefined : builder} addOns={addOns}
        onSaved={onPackagesSaved} onClose={() => setBuilder(null)} />}
      <div>
        {/* Manage Existing Packages Card */}
        <div className="bg-panel border-2 border-line shadow-lux p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b-2 border-line mb-4">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink">
                Package Catalog
              </h3>
              <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
                {packages.length} Packages
              </span>
              <button type="button" onClick={() => setBuilder("new")} className="min-h-10 border border-gold bg-gold px-3 font-black text-on-gold">Create package</button>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`p-3.5 border-2 transition-colors ${
                    pkg.is_active !== false
                      ? 'bg-panel border-line'
                      : 'bg-neutral-100 border-neutral-300 opacity-60'
                  }`}
                >
                    <div>
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black bg-obsidian text-gold px-1.5 py-0.5 uppercase">
                              {pkg.code}
                            </span>
                            <span className="font-bold text-sm text-ink uppercase">
                              {pkg.name}
                            </span>
                          </div>
                          <div className="font-mono text-sm font-black text-gold-soft mt-1">
                            {formatCurrency(pkg.amount)}
                          </div>
                        </div>

                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={pkg.builder_unpublished}
                            onClick={() => onTogglePackageActive(pkg.id, pkg.is_active !== false)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                              pkg.is_active !== false
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                                : 'bg-neutral-200 text-neutral-600 border-neutral-400'
                            }`}
                          >
                            {pkg.builder_unpublished ? 'Draft' : pkg.is_active !== false ? 'Active' : 'Archived'}
                          </button>
                          <span className={recordActionGroup}>
                            <RecordActionButton variant="edit" recordName={pkg.name} onClick={() => setBuilder(pkg)} />
                            <RecordActionButton variant="delete" recordName={pkg.name} onClick={() => promptDeletePackage(pkg)} />
                          </span>
                        </div>
                      </div>

                      {/* Inclusions Chips */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase border border-neutral-400">{PACKAGE_KIND_LABELS[(pkg.client_kind || 'school') as PackageKind]}</span>
                        <MuaRequirementBadge required={pkg.requires_mua} revenue={pkg.revenue_category} />
                        <span className="text-[10px] font-bold uppercase">{revenueLabels[pkg.revenue_category || '']}</span>
                        {!!pkg.photo_selection_limit && (
                          <span className="px-2 py-0.5 text-[10px] bg-gold-wash border border-neutral-300">Up to {pkg.photo_selection_limit} selected photos</span>
                        )}
                        {parsePackageInclusions(pkg.inclusions).map((inc, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-[10px] bg-gold-wash border border-neutral-300 text-neutral-700"
                          >
                            {inc}
                          </span>
                        ))}
                      </div>
                      {parsePackageInclusions(pkg.freebies).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft">
                            <Gift className="w-3 h-3" /> Freebies:
                          </span>
                          {parsePackageInclusions(pkg.freebies).map((item, i) => (
                            <span key={i} className="px-2 py-0.5 text-[10px] border border-gold text-gold-soft">{item}</span>
                          ))}
                        </div>
                      )}
                    </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD-ONS MANAGEMENT */}
      <div className="bg-panel border-2 border-line shadow-lux p-6 space-y-4">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-3 border-b-2 border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" />
            <span>Add-Ons &amp; Upgrades</span>
          </div>
          <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
            {addOns.length} Items
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
          {addOns.map((add) => (
            <div
              key={add.id}
              className={`p-3 border-2 flex flex-wrap justify-between items-center gap-2 ${
                add.is_active !== false
                  ? 'bg-panel border-line'
                  : 'bg-neutral-100 border-neutral-300 opacity-60'
              }`}
            >
              {editingAddonId === add.id ? (
                <div className="space-y-2 w-full bg-canvas p-2 border border-line">
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
              ) : (
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
              )}
            </div>
          ))}
        </div>
      </div>

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

const revenueLabels = { studio: 'Studio revenue', mua: 'Other Payment — MUA', '': 'Revenue review needed' };

function RevenueInput({ value, onChange }: { value: RevenueCategory | ''; onChange: (value: RevenueCategory | '') => void }) {
  return <label className="block text-xs font-bold">
    Revenue classification
    <select className="mt-1 block min-h-10 w-full border border-line bg-panel px-2"
      value={value} onChange={(event) => onChange(event.target.value as RevenueCategory | '')}>
      {!value && <option value="" disabled>{revenueLabels['']}</option>}
      <option value="studio">{revenueLabels.studio}</option>
      <option value="mua">{revenueLabels.mua}</option>
    </select>
  </label>;
}

function MuaRequirementInput({ checked, onChange, revenue, amount }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  revenue: RevenueCategory | '';
  amount: number;
}) {
  if (revenue !== 'mua' && !checked) return null;
  return (
    <fieldset className="border border-neutral-400 bg-panel px-3 py-2">
      <legend className="px-1 text-[10px] font-black uppercase">MUA service</legend>
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-gold" />
        {revenue === 'mua' ? 'This is an MUA Service' : 'Keep existing Makeup / Grooming queue requirement'}
      </label>
      {revenue === 'mua' ? (
        <div className="mt-1 space-y-1 text-xs text-neutral-600">
          {checked && <p className="font-bold text-gold-soft">{formatCurrency(amount, { exact: true })} per completion before discounts</p>}
          <p>Use this for standalone MUA charges. For portrait bundles, price the MUA service as a separate add-on.</p>
        </div>
      ) : <p className="mt-1 text-xs text-neutral-600">This item keeps its queue requirement. Artist earnings need a verified MUA allocation.</p>}
    </fieldset>
  );
}

function MuaRequirementBadge({ required, revenue }: { required?: boolean; revenue?: RevenueCategory | '' }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${
      required ? 'bg-gold-wash border-gold text-gold-soft' : 'bg-panel border-neutral-300 text-neutral-700'
    }`}>
      {required ? (revenue === 'mua' ? 'MUA Service' : 'MUA Queue Only') : 'No MUA Required'}
    </span>
  );
}

function DefaultAddOnInput({ checked, onChange, disabled }: {
  checked: boolean; onChange: (checked: boolean) => void; disabled: boolean;
}) {
  return (
    <fieldset className="mt-2 border border-neutral-400 bg-panel px-3 py-2" disabled={disabled}>
      <legend className="px-1 text-[10px] font-black uppercase">Default addon rule</legend>
      <label className="flex items-center gap-2 text-[11px] font-bold">
        <input type="checkbox" className="size-4 shrink-0 accent-gold" checked={checked}
          onChange={(event) => onChange(event.target.checked)} />
        Automatically apply if the client has no Makeup / Grooming service
      </label>
      {disabled ? <p className="mt-1 text-[10px] text-neutral-600">Available only for Other Payment — MUA add-ons.</p>
        : <p className="mt-1 text-[10px] text-neutral-600">Automatically adds this service when no Makeup / Grooming is selected. The client must still receive MUA confirmation before entering the photography queue.</p>}
    </fieldset>
  );
}

const PACKAGE_KIND_LABELS: Record<PackageKind, string> = { school: 'For school', walkin: 'For walk-in', both: 'School & walk-in' };
/** An add-on's client type; empty (older records) means both. */
const addOnKind = (add: AddOn): PackageKind => (add.client_kind || 'both') as PackageKind;

/** Which kiosk form offers the package. */
const PackageKindInput: React.FC<{ value: PackageKind; onChange: (value: PackageKind) => void }> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-[11px] font-black uppercase mb-1">Offered To</legend>
    <div className="grid grid-cols-3 gap-1.5">
      {(['school', 'walkin', 'both'] as const).map((kind) => (
        <button key={kind} type="button" aria-pressed={value === kind} onClick={() => onChange(kind)}
          className={`btn-tactile min-h-[38px] px-2 border text-[10px] font-black uppercase cursor-pointer ${
            value === kind ? 'bg-obsidian text-gold border-line' : 'bg-canvas text-neutral-600 border-neutral-300'
          }`}>
          {kind === 'school' ? 'School' : kind === 'walkin' ? 'Walk-in' : 'Both'}
        </button>
      ))}
    </div>
  </fieldset>
);
