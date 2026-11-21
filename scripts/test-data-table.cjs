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
