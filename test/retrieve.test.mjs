import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json') });

test('精确问题命中 active 知识并返回证据', () => {
  const result = retrieve(dataset, '时序逻辑依赖什么');
  assert.equal(result.direct[0].item.knowledge_id, 'k-timing-sequential');
  assert.ok(result.evidence.some((entry) => entry.source_id === 'src-ic-course'));
  assert.ok(result.metrics.contextChars < 900);
});

test('关系问题扩展前置知识', () => {
  const result = retrieve(dataset, '学习状态机前需要什么');
  assert.equal(result.direct[0].item.knowledge_id, 'k-fsm');
  assert.ok(result.neighbors.some(({ item, via }) => item.knowledge_id === 'k-counter' || via.type === 'belongs_to'));
});

test('deprecated 内容不会进入默认检索', () => {
  const result = retrieve(dataset, '旧版状态机示例');
  assert.equal(result.direct.some(({ item }) => item.knowledge_id === 'k-old-fsm'), false);
  assert.equal(result.neighbors.some(({ item }) => item.knowledge_id === 'k-old-fsm'), false);
});

test('无答案时返回空命中而不是伪造结果', () => {
  const result = retrieve(dataset, '量子计算纠错');
  assert.equal(result.direct.length, 0);
  assert.equal(result.neighbors.length, 0);
});
