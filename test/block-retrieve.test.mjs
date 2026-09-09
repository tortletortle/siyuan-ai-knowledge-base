import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../src/block-index.mjs';
import { blockIndexToDataset } from '../src/block-dataset.mjs';
import { retrieve } from '../src/retrieve.mjs';

test('块级索引可转换为检索数据并返回定位', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', hpath: '/课程/坐标', title: '坐标课程', source_id: 'src-1' }],
    blocks: [{ id: 'b-1', root_id: 'root-1', parent_id: 'root-1', type: 'p', content: '世界坐标可以转换为节点本地坐标。' }]
  });
  const dataset = blockIndexToDataset(index);
  const result = retrieve(dataset, '世界坐标转换', { mode: 'evidence', minScore: 1 });
  assert.equal(result.direct[0].item.block_id, 'b-1');
  assert.equal(result.direct[0].locator.doc_id, 'doc-1');
  assert.equal(result.direct[0].locator.block_id, 'b-1');
  assert.ok(result.evidence[0].locator.includes('b-1'));
});
