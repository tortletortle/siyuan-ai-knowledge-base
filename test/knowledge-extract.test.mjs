import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCorePoints, parseKnowledgePoint } from '../src/knowledge-extract.mjs';

test('知识抽取兼容 content 去掉 markdown 标记的标题和 i 块编号', () => {
  const result = extractCorePoints([
    { type: 'h', text: 'Action 动作系统', title: '第010课' },
    { type: 'h', text: '核心知识点', title: '第010课' },
    { type: 'i', text: '12. Action执行规则：Action 通过节点的 runAction 执行。', title: '第010课', source_id: 'src-1' },
    { type: 'p', text: 'Action执行规则：Action 通过节点的 runAction 执行。', title: '第010课', source_id: 'src-1' },
    { type: 'h', text: '术语表', title: '第010课' },
    { type: 'p', text: '不应进入知识库：答案：B', title: '第010课', source_id: 'src-1' }
  ]);
  assert.equal(result.sourceId, 'src-1');
  assert.equal(result.title, '第010课');
  assert.equal(result.points.length, 1);
  assert.equal(result.points[0].title, 'Action执行规则');
});

test('知识点解析支持无编号和 markdown 列表标记', () => {
  assert.deepEqual(parseKnowledgePoint('CC.Sprite组件获取方式：通过 getComponent 获取组件。'), {
    title: 'CC.Sprite组件获取方式', definition: '通过 getComponent 获取组件。'
  });
  assert.deepEqual(parseKnowledgePoint('- 1. 行高：控制每行高度。'), {
    title: '行高', definition: '控制每行高度。'
  });
});
