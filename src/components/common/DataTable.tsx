import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Key, MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { nextTableSort, sortTableRows, tablePageRange, toggleTableRow } from './dataTableModel';
import type { SortValue, TableExpansion, TablePage, TableSort, TableSortColumn } from './dataTableModel';

export interface DataTableColumn<Row, Id extends string = string> extends TableSortColumn<Row> {
  id: Id;
  header: ReactNode;
  description?: ReactNode;
  cell?: (row: Row) => ReactNode;
  sortable?: boolean;
  visible?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: CSSProperties['width'];
  minWidth?: CSSProperties['minWidth'];
  headerClassName?: string;
  cellClassName?: string;
}

interface PaginationOptions {
  pageSizes?: readonly number[];
  initialPageSize?: number;
  value?: TablePage;
  onChange?: (value: TablePage) => void;
}

type DataTableProps<Row, Id extends string> = {
  label: string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row, Id>[];
  getRowId: (row: Row) => Key;
  visibleColumnIds?: readonly Id[];
  defaultSort?: TableSort;
  /** Controlled sort. In server mode, the parent fetches rows for this selection. */
  sorting?: { value: TableSort; onChange: (value: TableSort) => void };
  /** Enabled by default. Supply value and onChange to control the page externally. */
  pagination?: false | PaginationOptions;
  loading?: boolean;
  loadingMessage?: ReactNode;
  emptyMessage?: ReactNode;
  filteredEmptyMessage?: ReactNode;
  filtered?: boolean;
  toolbar?: ReactNode;
  footer?: (visibleColumns: readonly DataTableColumn<Row, Id>[]) => ReactNode;
  onRowClick?: (row: Row) => void;
  renderExpanded?: (row: Row) => ReactNode;
  /** Enables the Multi-Expand control and lets tabs retain their own expansion state. */
  expansion?: { value: TableExpansion; onChange: (value: TableExpansion) => void };
  /** Place the detail toggle in a specific visible column and display a text label. */
  detailsColumnId?: Id;
  renderCompactRow?: (row: Row) => ReactNode;
  rowClassName?: (row: Row) => string;
  className?: string;
  viewportClassName?: string;
  tableClassName?: string;
  headerClassName?: string;
} & ({ mode?: 'client'; totalItems?: never } | { mode: 'server'; totalItems: number });

const defaultSizes = [10, 25, 50, 100];
const alignment = {
  left: 'text-left justify-start', center: 'text-center justify-center', right: 'text-right justify-end',
};

function displayValue(value: SortValue) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toLocaleString() : '—';
  return value == null || value === '' ? '—' : String(value);
}

function clickedControl(event: MouseEvent<HTMLTableRowElement>) {
  return event.target instanceof Element
    && !!event.target.closest('button, a, input, select, textarea, label, summary, [role="button"], [contenteditable], [data-row-action]');
}

export function DataTable<Row, Id extends string = string>({
  label, rows, columns, getRowId, visibleColumnIds, defaultSort = null, sorting, pagination,
  mode = 'client', totalItems, loading = false, loadingMessage = 'Loading records…',
  emptyMessage = 'No records available.', filteredEmptyMessage = 'No records match the selected filters.',
  filtered = false, toolbar, footer, onRowClick, renderExpanded, expansion, detailsColumnId, renderCompactRow,
  rowClassName, className = '', viewportClassName = '', tableClassName = '', headerClassName = '',
}: DataTableProps<Row, Id>) {
  const id = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const [localSort, setLocalSort] = useState(defaultSort);
  const options = pagination || undefined;
  const pageSizes = options?.pageSizes?.length ? options.pageSizes : defaultSizes;
  const [localPage, setLocalPage] = useState<TablePage>(() => ({
    page: 1, pageSize: options?.initialPageSize ?? pageSizes[0],
  }));
  const [localExpansion, setLocalExpansion] = useState<TableExpansion>({ multiple: true, keys: [] });
  const expandedKeys = expansion?.value.keys ?? localExpansion.keys;
  const sort = sorting ? sorting.value : localSort;
  const pageState = options?.value ?? localPage;
  const total = mode === 'server' ? (totalItems ?? 0) : rows.length;
  const range = tablePageRange(total, pageState);
  const activeColumn = columns.find((column) => column.id === sort?.column && column.sortable);
  const visible = columns.filter((column) => column.visible !== false
    && (!visibleColumnIds || visibleColumnIds.includes(column.id)));
  const detailsColumn = visible.find((column) => column.id === detailsColumnId) ?? visible[0];
  const ordered = useMemo(() => mode === 'server' ? rows : sortTableRows(rows, activeColumn, sort),
    [rows, activeColumn, sort, mode]);
  const paged = useMemo(() => mode === 'server' || pagination === false
    ? ordered : ordered.slice(range.offset, range.offset + pageState.pageSize),
  [ordered, mode, pagination, range.offset, pageState.pageSize]);

  useEffect(() => {
    if (loading || !expansion?.value.keys.length) return;
    const visibleKeys = new Set(paged.map(getRowId));
    const keys = expansion.value.keys.filter((key) => visibleKeys.has(key));
    if (keys.length !== expansion.value.keys.length) expansion.onChange({ ...expansion.value, keys });
  }, [expansion, getRowId, loading, paged]);

  const onPageChange = options?.onChange;
  useEffect(() => {
    if (loading || pagination === false || pageState.page === range.page) return;
    const clamped = { ...pageState, page: range.page };
    if (!options?.value) setLocalPage(clamped);
    onPageChange?.(clamped);
  }, [loading, pagination, pageState, range.page, options?.value, onPageChange]);

  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [range.page, pageState.pageSize, sort?.column, sort?.direction]);

  function changePage(value: TablePage) {
    if (!options?.value) setLocalPage(value);
    onPageChange?.(value);
  }

  function changeSort(column: string) {
    const next = nextTableSort(sort, column);
    if (sorting) sorting.onChange(next);
    else setLocalSort(next);
    if (pagination !== false && range.page !== 1) changePage({ ...pageState, page: 1 });
  }

  function activateRow(row: Row, key: Key) {
    if (renderExpanded) {
      if (expansion) expansion.onChange(toggleTableRow(expansion.value, key));
      else setLocalExpansion((current) => toggleTableRow(current, key));
    }
    onRowClick?.(row);
  }

  const interactive = Boolean(renderExpanded || onRowClick);
  const message = loading ? loadingMessage : filtered ? filteredEmptyMessage : emptyMessage;
  return (
    <div aria-busy={loading || undefined} className={`flex min-w-0 flex-col overflow-hidden border-2 border-line bg-panel shadow-lux ${className}`}>
      {toolbar}
      {renderExpanded && expansion && (
        <div className="flex justify-end border-b border-line px-2 py-1">
          <button type="button" aria-pressed={expansion.value.multiple} aria-label="Multi-Expand"
            onClick={() => expansion.onChange({
              multiple: !expansion.value.multiple,
              keys: expansion.value.multiple ? expansion.value.keys.slice(-1) : expansion.value.keys,
            })}
            className="inline-flex min-h-9 items-center gap-2 border border-line bg-canvas px-2 text-[11px] font-black uppercase text-ink focus-visible:outline-2 focus-visible:outline-gold">
            Multi-Expand
            <span aria-hidden="true" className={`px-1.5 py-0.5 font-mono ${
              expansion.value.multiple ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'
            }`}>{expansion.value.multiple ? 'On' : 'Off'}</span>
          </button>
        </div>
      )}
      <div ref={viewport} role="region" aria-label={label} tabIndex={0}
        className={`@container min-h-0 min-w-0 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${renderCompactRow ? 'hidden md:block' : ''} ${viewportClassName}`}>
        <table aria-label={label} className={`w-full border-separate border-spacing-0 text-left text-xs ${tableClassName}`}>
          <thead className={`sticky top-0 z-10 bg-obsidian text-[11px] font-black text-gold ${headerClassName}`}>
            <tr>
              {visible.map((column) => {
                const direction = activeColumn?.id === column.id ? sort?.direction : undefined;
                const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown;
                return (
                  <th key={column.id} scope="col" aria-sort={direction}
                    style={{ width: column.width, minWidth: column.minWidth }}
                    className={`px-3 py-2.5 align-top ${alignment[column.align ?? 'left']} ${column.headerClassName ?? ''}`}>
                    {column.sortable ? (
                      <button type="button" onClick={() => changeSort(column.id)}
                        className={`inline-flex w-full cursor-pointer items-center gap-1 font-bold focus-visible:outline-2 ${alignment[column.align ?? 'left']}`}>
                        <span>{column.header}</span><Icon className="size-3 shrink-0" aria-hidden="true" />
                      </button>
                    ) : column.header}
                    {column.description && <span className="mt-1 block whitespace-nowrap font-normal text-white">{column.description}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading || !paged.length ? (
              <tr><td colSpan={Math.max(1, visible.length)} className="p-8 text-center text-neutral-600">
                <div role="status">{message}</div>
              </td></tr>
            ) : paged.map((row) => {
              const key = getRowId(row);
              const isOpen = expandedKeys.includes(key);
              const detailId = `${id}-${encodeURIComponent(String(key))}`;
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <Fragment key={key}>
                  <tr className={`${interactive ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? 'hover:bg-canvas'}`}
                    onClick={interactive ? (event) => { if (!clickedControl(event)) activateRow(row, key); } : undefined}>
                    {visible.map((column) => (
                      <td key={column.id} className={`border-b border-neutral-200 px-3 py-2 ${alignment[column.align ?? 'left']} ${column.cellClassName ?? ''}`}>
                        {column === detailsColumn && interactive && (
                          <button type="button" aria-label={detailsColumnId ? (isOpen ? 'Hide details' : 'View details')
                            : renderExpanded ? (isOpen ? 'Collapse row' : 'Expand row') : 'Open row'}
                            aria-expanded={renderExpanded ? isOpen : undefined}
                            aria-controls={isOpen ? detailId : undefined}
                            onClick={(event) => {
                              event.stopPropagation();
                              activateRow(row, key);
                            }} className={detailsColumnId
                              ? 'inline-flex min-h-9 items-center gap-1 whitespace-nowrap font-bold text-gold-soft focus-visible:outline-2'
                              : 'mr-1 inline-flex align-middle focus-visible:outline-2'}>
                            <Chevron className="size-3" aria-hidden="true" />
                            {detailsColumnId && (isOpen ? 'Hide details' : 'View details')}
                          </button>
                        )}
                        {column.cell ? column.cell(row) : displayValue(column.accessor?.(row))}
                      </td>
                    ))}
                  </tr>
                  {isOpen && renderExpanded && (
                    <tr id={detailId}><td colSpan={visible.length} className="border-y-2 border-gold bg-canvas p-3">
                      <div className={`max-w-[calc(100cqw-1.5rem)] ${detailsColumnId || expansion ? 'sticky left-3' : ''}`}>{renderExpanded(row)}</div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {!loading && footer && <tfoot>{footer(visible)}</tfoot>}
        </table>
      </div>
      {renderCompactRow && (
        <div className="grid min-w-0 gap-4 p-3 md:hidden">
          {loading || !paged.length ? <div role="status" className="p-5 text-center text-neutral-600">{message}</div>
            : paged.map((row) => <Fragment key={getRowId(row)}>{renderCompactRow(row)}</Fragment>)}
        </div>
      )}
      {pagination !== false && (
        <nav aria-label={`${label} pagination`} className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-neutral-300 bg-panel px-3 py-2 font-mono text-[10px]">
          <span aria-live="polite" className="font-bold text-neutral-600">Showing {range.start}–{range.end} of {total}</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 font-bold uppercase">
              Rows per page
              <select value={pageState.pageSize} disabled={loading}
                onChange={(event) => changePage({ page: 1, pageSize: Number(event.target.value) })}
                className="min-h-8 border border-line bg-panel px-2 py-1 focus-visible:outline-2">
                {(pageSizes.includes(pageState.pageSize) ? pageSizes : [...pageSizes, pageState.pageSize]).map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button type="button" aria-label="Previous page" disabled={loading || range.page === 1}
              onClick={() => changePage({ ...pageState, page: range.page - 1 })}
              className="min-h-8 border border-line bg-panel px-2 py-1 font-black uppercase focus-visible:outline-2 disabled:opacity-40">Previous</button>
            <span className="min-w-12 text-center font-black">{range.page} / {range.totalPages}</span>
            <button type="button" aria-label="Next page" disabled={loading || range.page === range.totalPages}
              onClick={() => changePage({ ...pageState, page: range.page + 1 })}
              className="min-h-8 border border-line bg-panel px-2 py-1 font-black uppercase focus-visible:outline-2 disabled:opacity-40">Next</button>
          </div>
        </nav>
      )}
    </div>
  );
}
