import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, extractRefs } from '../src/block-index.mjs';
import { buildGraph, cleanLabel, toMermaid, toMOC } from '../src/graph.mjs';

const A = '20240101120000-aaa1111';
const B = '20240102120000-bbb2222';
const C = '20240103120000-ccc3333';

test('extractRefs 认出三种思源块引写法', () => {
  assert.deepEqual(extractRefs(`见 ((20240101120000-aaa1111 "行高")) 的说明`), [A]);
  assert.deepEqual(extractRefs(`见 ((${B}))`), [B]);
  assert.deepEqual(extractRefs(`[坐标转换](siyuan://blocks/${C}) 很重要`), [C]);
  assert.deepEqual(extractRefs(`<span data-type="block-ref" data-id="${A}">行高</span>`), [A]);
  assert.deepEqual(extractRefs('[[局部坐标]] 只是 wikilink，不算块引'), []);
  assert.deepEqual(extractRefs(`((${A})) 和 ((${A})) 去重`), [A]);
});

test('cleanLabel 把引用语法还原成人话', () => {
  assert.equal(cleanLabel('行高见 ((20240101120000-aaa1111 "对齐")) 即可'), '行高见 对齐 即可');
  assert.equal(cleanLabel('见 ((20240101120000-aaa1111))'), '见');
  assert.equal(cleanLabel('参考 [坐标转换](siyuan://blocks/20240101120000-aaa1111)'), '参考 坐标转换');
  assert.equal(cleanLabel('<span data-type="text">行高</span>很重要'), '行高很重要');
});

test('normalizeBlocks 透传 refs 字段', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', title: '样例' }],
    blocks: [
      { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' },
      { id: A, root_id: 'root-1', type: 'p', content: `行高见 ((${B} "对齐"))` }
    ]
  });
  assert.deepEqual(index.blocks[0].refs, [B]);
});

test('buildGraph 生成节点与引用边，未解析引用如实上报', () => {
  const graph = buildGraph([
    { block_id: A, text: 'Label 组件显示文本', title: 'Label', refs: [B, '20200101000000-xxxxxxx'] },
    { block_id: B, text: '行高控制行距', title: 'Label', refs: [] }
  ]);
  assert.equal(graph.stats.node_count, 2);
  assert.equal(graph.stats.edge_count, 1);
  assert.deepEqual(graph.edges[0], { from: A, to: B, type: 'references' });
  assert.equal(graph.stats.unresolved_count, 1);
  assert.deepEqual(graph.unresolved[0], { from: A, target: '20200101000000-xxxxxxx' });
});

test('toMermaid 输出可渲染的流程图', () => {
  const graph = buildGraph([
    { block_id: A, text: 'Label 组件', refs: [B] },
    { block_id: B, text: '行高', refs: [] }
  ]);
  const mermaid = toMermaid(graph);
  assert.ok(mermaid.startsWith('flowchart LR'));
  assert.ok(mermaid.includes('n20240101120000_aaa1111 --> n20240102120000_bbb2222'));
  assert.ok(mermaid.includes('Label 组件') && mermaid.includes('行高'));
});

test('toMOC 生成可粘贴进思源的块引地图', () => {
  const graph = buildGraph([
    { block_id: A, text: 'Label 组件显示文本', title: 'Label', refs: [B] },
    { block_id: B, text: '行高控制行距', title: 'Label', refs: [] }
  ]);
  const moc = toMOC(graph);
  assert.ok(moc.includes(`((${A} "Label 组件显示文本"))`));
  assert.ok(moc.includes(`((${A} "Label 组件显示文本")) → ((${B} "行高控制行距"))`));
});

test('端到端：三块笔记互相引用形成完整小图', () => {
  const index = buildIndex({
    documents: [{ id: 'doc-1', root_id: 'root-1', hpath: '/课程/K17', title: 'K17' }],
    blocks: [
      { id: 'root-1', root_id: 'root-1', type: 'd', content: '文档' },
      { id: A, root_id: 'root-1', type: 'p', content: `FSM 由状态和转移组成，见 ((${B} "时序逻辑"))` },
      { id: B, root_id: 'root-1', type: 'p', content: `时序逻辑依赖时钟，对比 [组合逻辑](siyuan://blocks/${C})` },
      { id: C, root_id: 'root-1', type: 'p', content: '组合逻辑只由当前输入决定' }
    ]
  });
  const graph = buildGraph(index.blocks);
  assert.deepEqual(graph.stats, { node_count: 3, edge_count: 2, unresolved_count: 0 });
});
