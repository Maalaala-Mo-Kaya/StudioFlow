const assert = require('node:assert/strict');
const { test } = require('node:test');

const model = import('../src/components/common/dataTableModel.ts');

test('single expansion is the default and opening the same row closes it', async () => {
  const { defaultTableExpansion, toggleTableRow } = await model;
  assert.deepEqual(defaultTableExpansion, { multiple: false, keys: [] });
  const first = toggleTableRow(defaultTableExpansion, 'first-job');
  const second = toggleTableRow(first, 'second-job');
  assert.deepEqual(second.keys, ['second-job']);
  assert.deepEqual(toggleTableRow(second, 'second-job').keys, []);
  assert.deepEqual(first.keys, ['first-job']);
});

test('multi-expand preserves opening order and independent collapses', async () => {
  const { defaultTableExpansion, toggleTableMultiExpand, toggleTableRow } = await model;
  const first = toggleTableRow(defaultTableExpansion, 'job-1');
  const multiple = toggleTableMultiExpand(first);
  assert.deepEqual(multiple, { multiple: true, keys: ['job-1'] });
  const all = ['job-3', 'job-2'].reduce(toggleTableRow, multiple);
  assert.deepEqual(all.keys, ['job-1', 'job-3', 'job-2']);
  assert.deepEqual(toggleTableRow(all, 'job-3').keys, ['job-1', 'job-2']);
  assert.deepEqual(toggleTableMultiExpand(all), { multiple: false, keys: ['job-2'] });
  assert.deepEqual(toggleTableMultiExpand(toggleTableRow(all, 'job-2')).keys, ['job-3']);
});

test('sorting and refresh preserve visible IDs and pagination discards departed rows', async () => {
  const { keepVisibleTableRows, sortTableRows, tablePageRange } = await model;
  const rows = [{ id: 'job-8', amount: 20 }, { id: 'job-1', amount: 200 }, { id: 'job-7', amount: 2 }];
  const column = { accessor: (row) => row.amount };
  const sorted = sortTableRows(rows, column, { column: 'amount', direction: 'ascending' });
  assert.deepEqual(sorted.map((row) => row.id), ['job-7', 'job-8', 'job-1']);
  const opened = { multiple: true, keys: ['job-1', 'job-8'] };
  assert.equal(keepVisibleTableRows(opened, new Set(sorted.map((row) => row.id))), opened);
  const range = tablePageRange(sorted.length, { page: 2, pageSize: 2 });
  assert.deepEqual(keepVisibleTableRows(opened, new Set(sorted.slice(range.offset).map((row) => row.id))).keys, ['job-1']);
  assert.deepEqual(keepVisibleTableRows(opened, new Set()).keys, []);
});

test('shared table keeps its columns and distinguishes request outcomes', async () => {
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { resolve } = require('node:path');
  const { runnerImport } = await import('vite');
  const { module: { DataTable } } = await runnerImport(resolve(__dirname, '../src/components/common/DataTable.tsx'), { configFile: false });
  const render = (props) => renderToStaticMarkup(createElement(DataTable, {
    label: 'Clients',
    columns: [
      { id: 'name', header: 'Client', accessor: (row) => row.name, minWidth: 140 },
      { id: 'status', header: 'Status', accessor: (row) => row.status, width: 88 },
    ],
    rows: [],
    getRowId: (row) => row.id,
    ...props,
  }));
  const loading = render({ loading: true });
  const empty = render({});
  const noResults = render({ searching: true, filtered: true });
  const filtered = render({ filtered: true });
  const error = render({ error: 'Client records could not be loaded.', onRetry() {} });
  const rows = [{ id: 'client-1', name: 'Retained record', status: 'Waiting' }];
  const refresh = render({ rows, refreshing: true });
  const refreshFailure = render({ rows, error: 'Refresh failed', onRetry() {} });

  for (const markup of [loading, empty, noResults, filtered, error, refresh, refreshFailure]) {
    assert.match(markup, /<colgroup><col style="width:calc\(140px .*?\)"\/><col style="width:88px"\/><\/colgroup>/);
    assert.match(markup, /<thead/);
  }
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(loading, /No records/);
  assert.match(empty, /No records available/);
  assert.match(noResults, /No records match your search/);
  assert.match(filtered, /No records match the selected filters/);
  assert.match(error, /role="alert"/);
  assert.match(error, />Retry<\/button>/);
  assert.doesNotMatch(error, /No records available/);
  assert.match(refresh, /Refreshing…/);
  assert.match(refresh, /Retained record/);
  assert.match(refreshFailure, /Refresh failed/);
  assert.match(refreshFailure, /Retained record/);
});
