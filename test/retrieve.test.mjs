import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json'), aliasesPath: join(root, 'fixtures/aliases.json') });

test('精确问题命中 active 知识', () => {
  const result = retrieve(dataset, '时序逻辑依赖什么');
  assert.equal(result.direct[0].item.knowledge_id, 'k-timing-sequential');
  assert.equal(result.evidence.length, 0);
  assert.ok(result.metrics.contextChars < 500);
});

test('关系问题按方向扩展前置知识', () => {
  const result = retrieve(dataset, '学习状态机前需要什么');
  assert.equal(result.intent, 'prerequisite');
  assert.equal(result.direct[0].item.knowledge_id, 'k-fsm');
  assert.ok(result.neighbors.some(({ item }) => item.knowledge_id === 'k-timing-sequential'));
});

test('摘要模式不默认加载正文和证据', () => {
  const result = retrieve(dataset, 'FSM 是什么');
  assert.equal(result.mode, 'summary');
  assert.equal(result.evidence.length, 0);
  assert.equal(result.context.includes('正文：'), false);
});

test('证据模式才加载可定位来源', () => {
  const result = retrieve(dataset, 'FSM 的来源是什么', { mode: 'evidence', minScore: 1 });
  assert.equal(result.intent, 'evidence');
  assert.ok(result.evidence.length > 0);
  assert.ok(result.evidence.every((entry) => entry.locator));
});

test('deprecated 内容不会进入默认检索', () => {
  const result = retrieve(dataset, '旧版状态机示例');
  assert.equal(result.direct.some(({ item }) => item.knowledge_id === 'k-old-fsm'), false);
  assert.equal(result.neighbors.some(({ item }) => item.knowledge_id === 'k-old-fsm'), false);
});

test('课程过滤不会召回其他课程条目', () => {
  const scoped = retrieve({ ...dataset, knowledge: dataset.knowledge.map((item) => ({ ...item, course_id: item.knowledge_id === 'k-fsm' ? 'digital' : 'other' })) }, 'FSM 是什么', { courseId: 'digital' });
  assert.ok(scoped.direct.every(({ item }) => item.course_id === 'digital'));
});

test('域外词不阻止合法知识命中', () => {
  const extended = { ...dataset, knowledge: [...dataset.knowledge, { knowledge_id: 'k-react', title: 'React useEffect 清理副作用', summary: 'React 内容', body: 'useEffect cleanup', topic: 'React', status: 'active', source_ids: [], relations: [], evidence: [] }] };
  const result = retrieve(extended, 'React useEffect', { minScore: 1 });
  assert.equal(result.direct[0].item.knowledge_id, 'k-react');
});

test('无答案时返回空命中而不是伪造结果', () => {
  const result = retrieve(dataset, '量子计算纠错');
  assert.equal(result.direct.length, 0);
  assert.equal(result.neighbors.length, 0);
});

test('相同正文在 limit 前去重，不会占用多个直接结果名额', () => {
  const duplicateDataset = {
    knowledge: [
      { knowledge_id: 'dup-1', title: '重复条目一', summary: '状态机定义', body: '状态机由状态和转移组成。', topic: '测试', status: 'active', source_ids: [], relations: [], evidence: [] },
      { knowledge_id: 'dup-2', title: '重复条目二', summary: '状态机定义', body: '状态机由状态和转移组成。', topic: '测试', status: 'active', source_ids: [], relations: [], evidence: [] },
      { knowledge_id: 'unique', title: '唯一条目', summary: '状态机应用', body: '状态机可以描述流程。', topic: '测试', status: 'active', source_ids: [], relations: [], evidence: [] }
    ],
    sources: [],
    aliases: []
  };
  const result = retrieve(duplicateDataset, '状态机', { minScore: 1, limit: 2 });
  assert.equal(result.direct.length, 2);
  assert.equal(new Set(result.direct.map(({ item }) => item.body)).size, 2);
  assert.ok(result.direct.some(({ item }) => item.knowledge_id === 'unique'));
});

test('标题相同但正文不同的条目不会被去重', () => {
  const result = retrieve({
    knowledge: [
      { knowledge_id: 'same-title-1', title: '同名主题', summary: '第一内容', body: '第一内容', topic: '测试', status: 'active', source_ids: [], relations: [], evidence: [] },
      { knowledge_id: 'same-title-2', title: '同名主题', summary: '第二内容', body: '第二内容', topic: '测试', status: 'active', source_ids: [], relations: [], evidence: [] }
    ],
    sources: [],
    aliases: []
  }, '同名主题', { minScore: 1, limit: 2 });
  assert.equal(result.direct.length, 2);
});

