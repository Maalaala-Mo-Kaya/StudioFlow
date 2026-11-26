import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Key, MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { defaultTableExpansion, keepVisibleTableRows, nextTableSort, sortTableRows, tablePageRange, toggleTableMultiExpand, toggleTableRow } from './dataTableModel';
import type { SortValue, TableExpansion, TablePage, TableSort, TableSortColumn } from './dataTableModel';
import { TablePagination } from './TablePagination';
import { DataFeedback, type DataRequestState } from './DataFeedback';

export const tableActions = 'flex flex-wrap items-center [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button>svg]:shrink-0';

export const tableFilterControl = 'min-h-10 min-w-0 max-w-full border border-line bg-panel px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-gold';

export interface DataTableColumn<Row, Id extends string = string> extends TableSortColumn<Row> {
  id: Id;
  header: ReactNode;
  description?: ReactNode;
  cell?: (row: Row) => ReactNode;
  sortable?: boolean;
  visible?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Width in pixels for compact values or controls. */
  width?: number;
  /** Starting width in pixels for a column that can grow with available space. */
  minWidth?: number;
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
  loadingMessage?: ReactNode;
  emptyMessage?: ReactNode;
  filteredEmptyMessage?: ReactNode;
  searching?: boolean;
  searchEmptyMessage?: ReactNode;
  filtered?: boolean;
  toolbar?: ReactNode;
  footer?: (visibleColumns: readonly DataTableColumn<Row, Id>[]) => ReactNode;
  onRowClick?: (row: Row) => void;
  renderExpanded?: (row: Row) => ReactNode;
  /** Optional controlled state for views that retain expansion across tab switches. */
  expansion?: { value: TableExpansion; onChange: (value: TableExpansion) => void };
  /** Place the detail toggle in a specific visible column and display a text label. */
  detailsColumnId?: Id;
  renderCompactRow?: (row: Row) => ReactNode;
  rowClassName?: (row: Row) => string;
  className?: string;
  viewportClassName?: string;
  tableClassName?: string;
  headerClassName?: string;
} & DataRequestState & ({ mode?: 'client'; totalItems?: never } | { mode: 'server'; totalItems: number });

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
  mode = 'client', totalItems, loading = false, refreshing = false, error, onRetry, loadingMessage = 'Loading records…',
  emptyMessage = 'No records available.', filteredEmptyMessage = 'No records match the selected filters.',
  searching = false, searchEmptyMessage = 'No records match your search.',
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
  const [localExpansion, setLocalExpansion] = useState(defaultTableExpansion);
  const expansionState = expansion?.value ?? localExpansion;
  const setExpansion = expansion?.onChange ?? setLocalExpansion;
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
    if (loading || !expansionState.keys.length) return;
    const next = keepVisibleTableRows(expansionState, new Set(paged.map(getRowId)));
    if (next !== expansionState) setExpansion(next);
  }, [expansionState, getRowId, loading, paged, setExpansion]);

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
    if (renderExpanded) setExpansion(toggleTableRow(expansionState, key));
    onRowClick?.(row);
  }

  const interactive = Boolean(renderExpanded || onRowClick);
  const blocked = loading || !paged.length;
  const feedback = { loading, refreshing, error, onRetry, loadingMessage };
  const empty = searching ? searchEmptyMessage : filtered ? filteredEmptyMessage : emptyMessage;
  const columnSizes = visible.map((column) => ({
    base: Math.max(column.width ?? column.minWidth ?? 96, column.minWidth ?? 0),
    grows: column.width === undefined,
  }));
  const minimumWidth = columnSizes.reduce((sum, { base }) => sum + base, 0);
  const flexibleWidth = columnSizes.reduce((sum, { base, grows }) => sum + (grows ? base : 0), 0);
  return (
    <div aria-busy={loading || refreshing || undefined} className={`flex min-w-0 flex-col overflow-hidden border-2 border-line bg-panel shadow-lux ${className}`}>
      {renderExpanded ? (
        <div className="flex flex-wrap items-end justify-end border-b border-line">
          {toolbar && <div className="min-w-0 grow basis-[min(100%,34rem)]">{toolbar}</div>}
          <button type="button" aria-pressed={expansionState.multiple} aria-label="Multi-Expand"
            onClick={() => setExpansion(toggleTableMultiExpand(expansionState))}
            className="m-2 ml-auto inline-flex min-h-9 shrink-0 items-center gap-2 border border-line bg-canvas px-2 text-[11px] font-black uppercase text-ink focus-visible:outline-2 focus-visible:outline-gold">
            Multi-Expand
            <span aria-hidden="true" className={`px-1.5 py-0.5 font-mono ${
              expansionState.multiple ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'
            }`}>{expansionState.multiple ? 'On' : 'Off'}</span>
          </button>
        </div>
      ) : toolbar}
      <div ref={viewport} role="region" aria-label={label} tabIndex={0}
        className={`@container min-w-0 flex-auto overflow-auto [scrollbar-gutter:stable] ${pagination !== false || loading ? 'min-h-44' : ''} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold ${renderCompactRow ? 'hidden md:block' : ''} ${viewportClassName}`}>
        <table aria-label={label} style={{ width: `max(100%, ${minimumWidth}px)` }}
          className={`studio-data-table table-fixed border-separate border-spacing-0 text-left text-xs ${tableClassName}`}>
          <colgroup>{visible.map((column, index) => {
            const { base, grows } = columnSizes[index];
            const width = grows && flexibleWidth
              ? `calc(${base}px + max(0px, 100cqw - ${minimumWidth}px) * ${base / flexibleWidth})`
              : base;
            return <col key={column.id} style={{ width }} />;
          })}</colgroup>
          <thead className={`sticky top-0 z-10 bg-obsidian text-[11px] font-black text-gold ${headerClassName}`}>
            <tr>
              {visible.map((column) => {
                const direction = activeColumn?.id === column.id ? sort?.direction : undefined;
                const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown;
                return (
                  <th key={column.id} scope="col" aria-sort={direction}
                    className={`px-3 py-2.5 align-top ${alignment[column.align ?? 'left']} ${column.headerClassName ?? ''}`}>
                    {column.sortable ? (
                      <button type="button" onClick={() => changeSort(column.id)}
                        className={`inline-flex w-full cursor-pointer items-center gap-1 font-bold focus-visible:outline-2 ${alignment[column.align ?? 'left']}`}>
                        <span>{column.header}</span><Icon className="size-3 shrink-0" aria-hidden="true" />
                      </button>
                    ) : column.header}
                    {column.description && <span className="mt-1 block font-normal text-white">{column.description}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {blocked ? (
              <>
                <tr><td colSpan={Math.max(1, visible.length)} className="px-3 py-3 text-center">
                  <div className="sticky left-3 w-[calc(100cqw-1.5rem)]"><DataFeedback {...feedback} emptyMessage={empty} /></div>
                </td></tr>
                {loading && Array.from({ length: Math.min(4, pageState.pageSize) }, (_, index) => (
                  <tr key={index} aria-hidden="true">
                    {visible.map((column) => <td key={column.id} className="border-b border-line px-3 py-3">
                      <div className="h-3 w-3/4 bg-line motion-safe:animate-pulse" />
                    </td>)}
                  </tr>
                ))}
              </>
            ) : paged.map((row) => {
              const key = getRowId(row);
              const isOpen = expansionState.keys.includes(key);
              const detailId = `${id}-${encodeURIComponent(String(key))}`;
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <Fragment key={key}>
                  <tr className={`${interactive ? 'cursor-pointer' : ''} ${isOpen ? 'bg-gold-wash' : ''} ${rowClassName?.(row) ?? 'hover:bg-canvas'}`}
                    onClick={interactive ? (event) => { if (!clickedControl(event)) activateRow(row, key); } : undefined}>
                    {visible.map((column) => (
                      <td key={column.id} className={`border-b border-neutral-200 px-3 py-4 md:py-2 [overflow-wrap:anywhere] ${alignment[column.align ?? 'left']} ${column.cellClassName ?? ''}`}>
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
                      <div className="sticky left-3 max-w-[calc(100cqw-1.5rem)]">{renderExpanded(row)}</div>
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
          {blocked ? <>
            <DataFeedback {...feedback} emptyMessage={empty} className="p-3 text-center" />
            {loading && Array.from({ length: Math.min(2, pageState.pageSize) }, (_, index) => (
              <div key={index} aria-hidden="true" className="space-y-3 border border-line bg-canvas p-4 motion-safe:animate-pulse">
                <div className="h-4 w-1/2 bg-line" />
                <div className="h-3 w-3/4 bg-line" />
                <div className="h-8 w-full bg-line" />
              </div>
            ))}
          </>
            : paged.map((row) => <Fragment key={getRowId(row)}>{renderCompactRow(row)}</Fragment>)}
        </div>
      )}
      {!blocked && (refreshing || error) && <DataFeedback {...feedback} className="border-t border-line px-3 py-2 text-center" />}
      {pagination !== false && (
        <TablePagination label={`${label} pagination`} pageLabel={`${range.page} / ${range.totalPages}`}
          summary={loading || (error && !paged.length) ? undefined : `Showing ${range.start}–${range.end} of ${total}`}
          previous={!loading && range.page > 1 ? () => changePage({ ...pageState, page: range.page - 1 }) : undefined}
          next={!loading && range.page < range.totalPages ? () => changePage({ ...pageState, page: range.page + 1 }) : undefined}
          controls={
            <label className="flex items-center gap-1 font-bold uppercase">
              Rows per page
              <select value={pageState.pageSize} disabled={loading}
                onChange={(event) => changePage({ page: 1, pageSize: Number(event.target.value) })}
                className="min-h-8 border border-line bg-panel px-2 py-1 focus-visible:outline-2">
                {(pageSizes.includes(pageState.pageSize) ? pageSizes : [...pageSizes, pageState.pageSize]).map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          }
        />
      )}
    </div>
  );
}
