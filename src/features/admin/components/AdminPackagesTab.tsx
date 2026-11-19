import React, { useState } from 'react';
import { Plus, Edit3, Trash2, Sparkles } from 'lucide-react';
import type { Package, AddOn } from '../../../types';
import { formatCurrency, parsePackageInclusions } from '../../../utils/formatters';
import { PackageInclusionsEditor } from './PackageInclusionsEditor';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';

interface AdminPackagesTabProps {
  packages: Package[];
  addOns: AddOn[];
  newPkgCode: string;
  onNewPkgCodeChange: (val: string) => void;
  newPkgName: string;
  onNewPkgNameChange: (val: string) => void;
  newPkgAmount: number;
  onNewPkgAmountChange: (val: number) => void;
  newPkgPhotoLimit: number;
  onNewPkgPhotoLimitChange: (val: number) => void;
  newPkgRequiresMua: boolean;
  onNewPkgRequiresMuaChange: (val: boolean) => void;
  newPkgInclusions: string;
  onNewPkgInclusionsChange: (val: string) => void;
  onAddPackage: (e: React.FormEvent) => void;
  onUpdatePackage: (
    id: string,
    data: { name: string; code: string; amount: number; inclusions: string[]; photo_selection_limit: number; requires_mua: boolean }
  ) => Promise<void>;
  onTogglePackageActive: (id: string, current: boolean) => Promise<void>;
  onDeletePackage: (id: string) => Promise<void>;
  onAddAddOn: (name: string, code: string, amount: number, requiresMua: boolean) => Promise<void>;
  onUpdateAddOn: (id: string, name: string, code: string, amount: number, requiresMua: boolean) => Promise<void>;
  onToggleAddOnActive: (id: string, current: boolean) => Promise<void>;
  onDeleteAddOn: (id: string) => Promise<void>;
}

export const AdminPackagesTab: React.FC<AdminPackagesTabProps> = ({
  packages,
  addOns,
  newPkgCode,
  onNewPkgCodeChange,
  newPkgName,
  onNewPkgNameChange,
  newPkgAmount,
  onNewPkgAmountChange,
  newPkgPhotoLimit,
  onNewPkgPhotoLimitChange,
  newPkgRequiresMua,
  onNewPkgRequiresMuaChange,
  newPkgInclusions,
  onNewPkgInclusionsChange,
  onAddPackage,
  onUpdatePackage,
  onTogglePackageActive,
  onDeletePackage,
  onAddAddOn,
  onUpdateAddOn,
  onToggleAddOnActive,
  onDeleteAddOn,
}) => {
  const { toast } = useToast();

  // Editing Package State
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [editPkgCode, setEditPkgCode] = useState('');
  const [editPkgName, setEditPkgName] = useState('');
  const [editPkgAmount, setEditPkgAmount] = useState(0);
  const [editPkgPhotoLimit, setEditPkgPhotoLimit] = useState(0);
  const [editPkgRequiresMua, setEditPkgRequiresMua] = useState(false);
  const [editPkgInclusionsArray, setEditPkgInclusionsArray] = useState<string[]>([]);

  // Add-on Form State
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonCode, setNewAddonCode] = useState('');
  const [newAddonAmount, setNewAddonAmount] = useState(250);
  const [newAddonRequiresMua, setNewAddonRequiresMua] = useState(false);

  // Editing Add-on State
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [editAddonName, setEditAddonName] = useState('');
  const [editAddonCode, setEditAddonCode] = useState('');
  const [editAddonAmount, setEditAddonAmount] = useState(0);
  const [editAddonRequiresMua, setEditAddonRequiresMua] = useState(false);

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

  const startEditPkg = (pkg: Package) => {
    setEditingPkgId(pkg.id);
    setEditPkgCode(pkg.code);
    setEditPkgName(pkg.name);
    setEditPkgAmount(pkg.amount);
    setEditPkgPhotoLimit(pkg.photo_selection_limit ?? 0);
    setEditPkgRequiresMua(!!pkg.requires_mua);
    setEditPkgInclusionsArray(parsePackageInclusions(pkg.inclusions));
  };

  const handleSavePkgEdit = async () => {
    if (!editingPkgId) return;
    try {
      await onUpdatePackage(editingPkgId, {
        code: editPkgCode,
        name: editPkgName,
        amount: editPkgAmount,
        inclusions: editPkgInclusionsArray,
        photo_selection_limit: editPkgPhotoLimit,
        requires_mua: editPkgRequiresMua,
      });
      toast.success(`Package "${editPkgName}" updated successfully`);
      setEditingPkgId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update package');
    }
  };

  const startEditAddon = (add: AddOn) => {
    setEditingAddonId(add.id);
    setEditAddonName(add.name);
    setEditAddonCode(add.code || '');
    setEditAddonAmount(add.amount);
    setEditAddonRequiresMua(!!add.requires_mua);
  };

  const handleSaveAddonEdit = async () => {
    if (!editingAddonId) return;
    try {
      await onUpdateAddOn(editingAddonId, editAddonName, editAddonCode, editAddonAmount, editAddonRequiresMua);
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
      await onAddAddOn(newAddonName, newAddonCode, newAddonAmount, newAddonRequiresMua);
      toast.success(`Add-on "${newAddonName}" added to catalog`);
      setNewAddonName('');
      setNewAddonCode('');
      setNewAddonAmount(250);
      setNewAddonRequiresMua(false);
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

  const newPkgInclusionsList = newPkgInclusions
    ? newPkgInclusions.split('\n').filter(Boolean)
    : [];

  return (
    <div className="space-y-8 animate-enter font-mono text-xs">
      {/* SECTION 1: PACKAGES MANAGEMENT (T020) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Create Package Card */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A] pb-3 border-b-2 border-[#0A0A0A] mb-4">
            Create Portrait Package
          </h3>
          <form onSubmit={onAddPackage} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-black uppercase mb-1">
                  Package Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="PKG-D"
                  value={newPkgCode}
                  onChange={(e) => onNewPkgCodeChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white uppercase font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase mb-1">
                  Amount (₱) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newPkgAmount}
                  onChange={(e) => onNewPkgAmountChange(Number(e.target.value))}
                  className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase mb-1">
                Package Title / Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Executive Graduation Package"
                value={newPkgName}
                onChange={(e) => onNewPkgNameChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-semibold"
              />
            </div>

            <PhotoLimitInput value={newPkgPhotoLimit} onChange={onNewPkgPhotoLimitChange} />
            <MuaRequirementInput checked={newPkgRequiresMua} onChange={onNewPkgRequiresMuaChange} />

            {/* Dynamic Form List for Inclusions */}
            <PackageInclusionsEditor
              inclusions={newPkgInclusionsList}
              onChange={(items) => onNewPkgInclusionsChange(items.join('\n'))}
              label="Package Inclusions (Repeatable List)"
            />

            <button
              type="submit"
              className="btn-tactile w-full min-h-[44px] py-2.5 bg-[#0A0A0A] text-[#C9A227] border border-[#0A0A0A] font-black uppercase tracking-widest cursor-pointer"
            >
              Save Package to Catalog
            </button>
          </form>
        </div>

        {/* Manage Existing Packages Card */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A] mb-4">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A]">
                Package Catalog
              </h3>
              <span className="font-mono text-[10px] bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 font-bold">
                {packages.length} Packages
              </span>
            </div>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className={`p-3.5 border-2 transition-colors ${
                    pkg.is_active !== false
                      ? 'bg-white border-[#0A0A0A]'
                      : 'bg-neutral-100 border-neutral-300 opacity-60'
                  }`}
                >
                  {editingPkgId === pkg.id ? (
                    <div className="space-y-3 bg-[#F8F7F4] p-3 border border-[#0A0A0A]">
                      <div className="text-[11px] font-black uppercase text-[#9A7816] border-b pb-1">
                        Editing Package // {pkg.code}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-600 mb-0.5">
                            Package Code
                          </label>
                          <input
                            type="text"
                            value={editPkgCode}
                            onChange={(e) => setEditPkgCode(e.target.value)}
                            className="w-full p-1.5 border border-[#0A0A0A] uppercase font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-neutral-600 mb-0.5">
                            Amount (₱)
                          </label>
                          <input
                            type="number"
                            value={editPkgAmount}
                            onChange={(e) => setEditPkgAmount(Number(e.target.value))}
                            className="w-full p-1.5 border border-[#0A0A0A] font-bold bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-neutral-600 mb-0.5">
                          Package Title / Name
                        </label>
                        <input
                          type="text"
                          value={editPkgName}
                          onChange={(e) => setEditPkgName(e.target.value)}
                          className="w-full p-1.5 border border-[#0A0A0A] bg-white font-semibold"
                        />
                      </div>

                      <PhotoLimitInput value={editPkgPhotoLimit} onChange={setEditPkgPhotoLimit} />
                      <MuaRequirementInput checked={editPkgRequiresMua} onChange={setEditPkgRequiresMua} />

                      {/* Repeatable Inclusions Editor in Edit Mode */}
                      <PackageInclusionsEditor
                        inclusions={editPkgInclusionsArray}
                        onChange={setEditPkgInclusionsArray}
                        label="Edit Inclusions List"
                      />

                      <div className="flex gap-2 justify-end pt-2 border-t border-neutral-300">
                        <button
                          type="button"
                          onClick={() => setEditingPkgId(null)}
                          className="btn-tactile px-3 py-1.5 bg-white border border-[#0A0A0A] font-bold uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePkgEdit}
                          className="btn-tactile px-4 py-1.5 bg-[#0A0A0A] text-[#C9A227] font-black uppercase border border-[#0A0A0A] cursor-pointer"
                        >
                          ✓ Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black bg-[#0A0A0A] text-[#C9A227] px-1.5 py-0.5 uppercase">
                              {pkg.code}
                            </span>
                            <span className="font-bold text-sm text-[#0A0A0A] uppercase">
                              {pkg.name}
                            </span>
                          </div>
                          <div className="font-mono text-sm font-black text-[#9A7816] mt-1">
                            {formatCurrency(pkg.amount)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onTogglePackageActive(pkg.id, pkg.is_active !== false)}
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                              pkg.is_active !== false
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                                : 'bg-neutral-200 text-neutral-600 border-neutral-400'
                            }`}
                          >
                            {pkg.is_active !== false ? 'Active' : 'Archived'}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditPkg(pkg)}
                            className="p-1 hover:bg-neutral-200 border border-neutral-300 cursor-pointer"
                            title="Edit Package"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDeletePackage(pkg)}
                            className="p-1 text-red-600 hover:bg-red-50 border border-neutral-300 hover:border-red-600 cursor-pointer"
                            title="Delete Package"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Inclusions Chips */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <MuaRequirementBadge required={pkg.requires_mua} />
                        {!!pkg.photo_selection_limit && (
                          <span className="px-2 py-0.5 text-[10px] bg-[#F7F2E0] border border-neutral-300">Up to {pkg.photo_selection_limit} selected photos</span>
                        )}
                        {parsePackageInclusions(pkg.inclusions).map((inc, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-[10px] bg-[#F7F2E0] border border-neutral-300 text-neutral-700"
                          >
                            {inc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD-ONS MANAGEMENT */}
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6 space-y-4">
        <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A] pb-3 border-b-2 border-[#0A0A0A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C9A227]" />
            <span>Add-Ons &amp; Upgrades</span>
          </div>
          <span className="font-mono text-[10px] bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 font-bold">
            {addOns.length} Items
          </span>
        </h3>

        {/* Create Add-on Form */}
        <form
          onSubmit={handleCreateAddon}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3 bg-[#F8F7F4] border border-[#0A0A0A]"
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
              className="w-full p-2 border border-neutral-400 bg-white font-semibold"
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
              className="w-full p-2 border border-neutral-400 bg-white uppercase font-bold"
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
              className="w-full p-2 border border-neutral-400 bg-white font-black"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="btn-tactile w-full py-2.5 bg-[#0A0A0A] text-[#C9A227] font-black uppercase flex items-center justify-center gap-1 cursor-pointer min-h-[38px]"
            >
              <Plus className="w-4 h-4" /> Add to Catalog
            </button>
          </div>
          <div className="sm:col-span-4">
            <MuaRequirementInput checked={newAddonRequiresMua} onChange={setNewAddonRequiresMua} />
          </div>
        </form>

        {/* Add-on List Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {addOns.map((add) => (
            <div
              key={add.id}
              className={`p-3 border-2 flex justify-between items-center ${
                add.is_active !== false
                  ? 'bg-white border-[#0A0A0A]'
                  : 'bg-neutral-100 border-neutral-300 opacity-60'
              }`}
            >
              {editingAddonId === add.id ? (
                <div className="space-y-2 w-full bg-[#F8F7F4] p-2 border border-[#0A0A0A]">
                  <div>
                    <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                      Add-On Item Name
                    </label>
                    <input
                      type="text"
                      value={editAddonName}
                      onChange={(e) => setEditAddonName(e.target.value)}
                      className="w-full p-1.5 border border-[#0A0A0A] bg-white font-semibold"
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
                        className="w-full p-1 border border-[#0A0A0A] uppercase bg-white font-bold"
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
                        className="w-full p-1 border border-[#0A0A0A] bg-white font-black"
                      />
                    </div>
                  </div>
                  <MuaRequirementInput checked={editAddonRequiresMua} onChange={setEditAddonRequiresMua} />
                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingAddonId(null)}
                      className="btn-tactile px-2.5 py-1 bg-white border border-[#0A0A0A] font-bold uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAddonEdit}
                      className="btn-tactile px-3 py-1 bg-[#0A0A0A] text-[#C9A227] font-black uppercase border border-[#0A0A0A] cursor-pointer"
                    >
                      ✓ Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="font-bold text-[#0A0A0A] uppercase block">{add.name}</span>
                    <span className="font-mono font-black text-[#9A7816]">
                      +{formatCurrency(add.amount)}
                    </span>
                    {add.code && (
                      <span className="text-[10px] text-neutral-500 ml-2">({add.code})</span>
                    )}
                    <div className="mt-1"><MuaRequirementBadge required={add.requires_mua} /></div>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                    <button
                      type="button"
                      onClick={() => startEditAddon(add)}
                      className="p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                      title="Edit Add-on"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => promptDeleteAddOn(add)}
                      className="p-1 text-red-600 border border-neutral-300 hover:border-red-600 hover:bg-red-50 cursor-pointer"
                      title="Delete Add-on"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
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

function PhotoLimitInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-[11px] font-black uppercase">
      Photo selection limit <span className="font-normal normal-case">(0 for unlimited)</span>
      <input type="number" min="0" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full min-h-[42px] px-3 py-2 border border-neutral-400 bg-white font-bold" />
    </label>
  );
}

function MuaRequirementInput({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <fieldset className="border border-neutral-400 bg-white px-3 py-2">
      <legend className="px-1 text-[10px] font-black uppercase">MUA Queue Requirement</legend>
      <label className="flex items-center gap-2 text-[11px] font-bold uppercase">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-[#C9A227]" />
        Require makeup / grooming
      </label>
      <p className="mt-1 text-[10px] text-neutral-600">Sends students to the MUA queue after confirmed payment.</p>
    </fieldset>
  );
}

function MuaRequirementBadge({ required }: { required?: boolean }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase border ${
      required ? 'bg-[#F7F2E0] border-[#C9A227] text-[#765B12]' : 'bg-white border-neutral-300 text-neutral-700'
    }`}>
      {required ? 'MUA Required' : 'No MUA Required'}
    </span>
  );
}
