import React from 'react';
import { UserCheck, Search } from 'lucide-react';
import type { MasterListItem } from '../../../types';

interface MasterListLookupProps {
  masterList: MasterListItem[];
  isSearching: boolean;
  onToggleSearch: () => void;
  searchName: string;
  onSearchNameChange: (value: string) => void;
  onSelectItem: (item: MasterListItem) => void;
}

export const MasterListLookup: React.FC<MasterListLookupProps> = ({
  masterList,
  isSearching,
  onToggleSearch,
  searchName,
  onSearchNameChange,
  onSelectItem,
}) => {
  if (masterList.length === 0) return null;

  const filteredItems =
    searchName.trim().length > 1
      ? masterList.filter((m) => m.full_name.toLowerCase().includes(searchName.trim().toLowerCase()))
      : [];

  return (
    <div className="animate-enter-delay-1 bg-gold-wash border-2 border-line p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-ink">
          <div className="w-9 h-9 bg-obsidian text-gold flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-black text-xs uppercase tracking-wider block">
              School Master List Lookup
            </span>
            <span className="text-[11px] font-medium text-neutral-600">
              Pre-listed by your school? Search your name to auto-populate your form.
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleSearch}
          className="btn-tactile min-h-[38px] px-4 py-2 bg-obsidian text-gold text-[11px] font-black uppercase tracking-widest self-start sm:self-auto cursor-pointer"
        >
          {isSearching ? 'Close Lookup' : 'Search Roster'}
        </button>
      </div>

      {isSearching && (
        <div className="mt-4 pt-3 border-t border-line/20">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Type your surname or full name..."
              value={searchName}
              onChange={(e) => onSearchNameChange(e.target.value)}
              className="w-full min-h-[44px] text-sm pl-10 pr-4 py-2 border border-line focus:outline-none bg-panel font-semibold"
            />
          </div>
          {searchName.trim().length > 1 && filteredItems.length === 0 && (
            <p role="status" className="mt-2 text-xs text-neutral-600">No roster entries match your search.</p>
          )}
          {filteredItems.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto bg-panel border border-line divide-y divide-neutral-200 text-xs">
              {filteredItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  className="w-full text-left p-3 hover:bg-gold-wash flex justify-between items-center transition cursor-pointer"
                >
                  <span className="font-bold text-ink uppercase">{item.full_name}</span>
                  <span className="text-[10px] font-mono bg-obsidian text-gold px-2 py-0.5 uppercase">
                    {item.section || item.student_id || 'Select'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
