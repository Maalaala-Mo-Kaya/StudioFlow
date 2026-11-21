import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Filter, Search } from 'lucide-react';
import { tableFilterControl } from '../../../components/common/DataTable';

type FilterOption = { id: string; label: string };

interface StudentDirectoryFiltersProps<Column extends string, Key extends string> {
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder?: string;
  sections: readonly { key: Key; title: string }[];
  filters: Record<Key, string[]>;
  options: Record<Key, FilterOption[]>;
  onToggleFilter: (key: Key, id: string) => void;
  onClearFilters: () => void;
  columns: readonly { id: Column; label: string }[];
  visibleColumns: Column[];
  onToggleColumn: (id: Column) => void;
  onSelectAllColumns?: () => void;
  onResetColumns: () => void;
  /** Quick filter shown between the filter button and the search box (e.g. School / Walk-in). */
  quickFilter?: ReactNode;
  /** Accessible name of the search box. */
  searchLabel?: string;
  /** Render without the panel box, to sit inside another bar (e.g. the cashier tabs). */
  bare?: boolean;
}

const sectionClass = 'group border-b border-neutral-200 last:border-b-0';
const summaryClass = 'flex cursor-pointer list-none items-center justify-between gap-2 bg-canvas px-3 py-2 font-bold uppercase [&::-webkit-details-marker]:hidden';
const actionClass = 'btn-tactile border border-neutral-300 px-2 py-1 font-bold hover:border-line disabled:cursor-default disabled:opacity-50';
const optionClass = 'flex min-h-8 cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-canvas';

export function StudentDirectoryFilters<Column extends string, Key extends string>({
  query,
  onQueryChange,
  searchPlaceholder = 'Search name, JO №, ID...',
  sections,
  filters,
  options,
  onToggleFilter,
  onClearFilters,
  columns,
  visibleColumns,
  onToggleColumn,
  onSelectAllColumns,
  onResetColumns,
  quickFilter,
  searchLabel = 'Search client registrations',
  bare = false,
}: StudentDirectoryFiltersProps<Column, Key>) {
  const [open, setOpen] = useState(false);
  const [desktopMaxHeight, setDesktopMaxHeight] = useState<number>();
  const panelId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const activeCount = sections.reduce((count, { key }) => count + filters[key].length, 0);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (container.current?.contains(document.activeElement)) trigger.current?.focus();
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePanelHeight = () => {
      if (!panel.current || window.innerWidth < 1024) {
        setDesktopMaxHeight(undefined);
        return;
      }

      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportTop = viewport?.offsetTop ?? 0;
      const panelTop = panel.current.getBoundingClientRect().top - viewportTop;
      const availableHeight = Math.max(0, viewportHeight - panelTop - 16);
      const responsiveHeight = Math.min(viewportHeight * 0.55, window.innerWidth * 0.25, 352);

      setDesktopMaxHeight(Math.floor(Math.min(availableHeight, responsiveHeight)));
    };

    updatePanelHeight();
    window.addEventListener('resize', updatePanelHeight);
    window.addEventListener('scroll', updatePanelHeight, true);
    window.visualViewport?.addEventListener('resize', updatePanelHeight);
    window.visualViewport?.addEventListener('scroll', updatePanelHeight);

    return () => {
      window.removeEventListener('resize', updatePanelHeight);
      window.removeEventListener('scroll', updatePanelHeight, true);
      window.visualViewport?.removeEventListener('resize', updatePanelHeight);
      window.visualViewport?.removeEventListener('scroll', updatePanelHeight);
    };
  }, [open]);

  return (
    <div className={bare ? '' : 'bg-panel border-2 border-line shadow-lux p-4'}>
      <div ref={container} className="relative">
        <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2">
          <button
            ref={trigger}
            type="button"
            aria-label={activeCount ? `Advanced Filters (${activeCount} selected)` : 'Advanced Filters'}
            title="Advanced Filters"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen(!open)}
            className={`btn-tactile relative grid min-h-10 min-w-10 shrink-0 cursor-pointer place-items-center border-2 border-line ${
              open || activeCount ? 'bg-obsidian text-gold' : 'bg-panel text-ink hover:bg-gold-wash'
            }`}
          >
            <Filter aria-hidden="true" className="size-4" />
            {activeCount > 0 && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 min-w-4 border border-line bg-gold px-0.5 text-[9px] font-black leading-3.5 text-on-gold">
                {activeCount}
              </span>
            )}
          </button>
          {quickFilter}
          <div className={`relative flex min-w-0 flex-1 ${quickFilter ? 'basis-full sm:basis-auto' : ''}`}>
            <Search aria-hidden="true" className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              aria-label={searchLabel}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              className={`${tableFilterControl} w-full pl-9 pr-3 font-semibold`}
            />
          </div>
        </div>

        <section
          ref={panel}
          id={panelId}
          hidden={!open}
          aria-label="Advanced Filters"
          style={desktopMaxHeight === undefined ? undefined : { maxHeight: desktopMaxHeight }}
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(65dvh,28rem)] overflow-y-auto overscroll-contain border-2 border-line bg-panel shadow-lux sm:right-auto sm:w-full sm:max-w-md lg:max-w-[clamp(15rem,22vw,20rem)]"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-2 border-line bg-panel px-3 py-2">
            <h3 className="font-black uppercase tracking-wider">Advanced Filters</h3>
            <button type="button" onClick={onClearFilters} disabled={!activeCount} className={actionClass}>
              Clear Filters
            </button>
          </div>
          {sections.map(({ key, title }) => (
            <details key={key} open={key === 'school' ? true : undefined} className={sectionClass}>
              <summary className={summaryClass}>
                <span>{title}{filters[key].length > 0 && ` (${filters[key].length})`}</span>
                <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 -rotate-90 group-open:rotate-0" />
              </summary>
              {options[key].length ? options[key].map(({ id, label }) => (
                <label key={id} className={optionClass}>
                  <input
                    type="checkbox"
                    checked={filters[key].includes(id)}
                    onChange={() => onToggleFilter(key, id)}
                    className="size-4 shrink-0 accent-gold"
                  />
                  <span className="min-w-0 wrap-break-word">{label}</span>
                </label>
              )) : <p className="px-3 py-2 text-neutral-500">No options available.</p>}
            </details>
          ))}
          <details className={sectionClass}>
            <summary className={summaryClass}>
              <span>Show Columns</span>
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 -rotate-90 group-open:rotate-0" />
            </summary>
            <div className="flex flex-wrap gap-2 px-3 py-2">
              <button type="button" onClick={onSelectAllColumns ?? onResetColumns} className={actionClass}>Select All</button>
              <button type="button" onClick={onResetColumns} className={actionClass}>Reset to Default</button>
            </div>
            {columns.map(({ id, label }) => {
              const checked = visibleColumns.includes(id);
              return (
                <label key={id} className={optionClass}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && visibleColumns.length === 1}
                    onChange={() => onToggleColumn(id)}
                    className="size-4 shrink-0 accent-gold"
                  />
                  {label}
                </label>
              );
            })}
            <p className="px-3 pb-2 text-[10px] text-neutral-500">Keep at least one column visible.</p>
          </details>
        </section>
      </div>
    </div>
  );
}
