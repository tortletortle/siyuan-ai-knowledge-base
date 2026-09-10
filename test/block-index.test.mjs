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

test('排除纯文本卡片和测验标题及其后代', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', hpath: '/课程/样例', title: '样例' }],
    blocks: [
      { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' },
      { id: 'cards', root_id: 'root-1', type: 'p', content: '卡片' },
      { id: 'card-child', root_id: 'root-1', parent_id: 'cards', type: 'p', content: 'Q: 被排除' },
      { id: 'card-grandchild', root_id: 'root-1', parent_id: 'card-child', type: 'p', content: 'A: 也被排除' },
      { id: 'quiz', root_id: 'root-1', type: 'p', content: '测验' },
      { id: 'quiz-child', root_id: 'root-1', parent_id: 'quiz', type: 'p', content: '选项也被排除' },
      { id: 'kept', root_id: 'root-1', type: 'p', content: '卡片设计原理应保留' }
    ]
  });
  assert.deepEqual(index.blocks.map((block) => block.block_id), ['kept']);
});

test('标题内容为空时从 markdown 识别卡片区段', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', title: '样例' }],
    blocks: [
      { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' },
      { id: 'cards', root_id: 'root-1', type: 'h', content: '', markdown: '## 卡片' },
      { id: 'child', root_id: 'root-1', parent_id: 'cards', type: 'p', content: '应排除' },
      { id: 'kept', root_id: 'root-1', type: 'p', content: '正文保留' }
    ]
  });
  assert.deepEqual(index.blocks.map((block) => block.block_id), ['kept']);
});
