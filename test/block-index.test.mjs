import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex } from '../src/block-index.mjs';

test('规范化思源块并保留文档和块定位', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', hpath: '/课程/样例', title: '样例', source_id: 'src-1' }],
    blocks: [
      { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' },
      { id: 'b-1', root_id: 'root-1', parent_id: 'root-1', type: 'p', content: '[[局部坐标]] 和世界坐标' },
      { id: 'b-nav', root_id: 'root-1', type: 'l', content: '课程导航' },
      { id: 'b-empty', root_id: 'root-1', type: 'p', content: '  ' }
    ]
  });
  assert.equal(index.block_count, 1);
  assert.equal(index.blocks[0].block_id, 'b-1');
  assert.equal(index.blocks[0].doc_id, 'doc-1');
  assert.deepEqual(index.blocks[0].links, ['局部坐标']);
  assert.equal(index.blocks[0].source_id, 'src-1');
  assert.equal(index.blocks[0].content_hash.length, 64);
});
