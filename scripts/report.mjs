import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json') });
const cases = ['时序逻辑依赖什么', '学习状态机前需要什么', '旧版状态机示例', '量子计算纠错'];
const report = cases.map((query) => {
  const result = retrieve(dataset, query);
  return { query, direct: result.direct.map(({ item }) => item.knowledge_id), neighbors: result.neighbors.map(({ item, via }) => `${via.type}:${item.knowledge_id}`), sources: [...new Set(result.evidence.map((entry) => entry.source_id))], metrics: result.metrics };
});
console.log(JSON.stringify({ generated_at: new Date().toISOString(), report }, null, 2));
