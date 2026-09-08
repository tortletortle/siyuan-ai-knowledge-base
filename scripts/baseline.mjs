import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json') });
const query = '学习状态机前需要什么';
const fullSourceText = dataset.knowledge.map((item) => `${item.title}\n${item.summary}\n${item.body}\n${(item.evidence ?? []).map((entry) => `${entry.locator}: ${entry.quote}`).join('\n')}`).join('\n');
const result = retrieve(dataset, query);
console.log(JSON.stringify({ query, baselineChars: fullSourceText.length, contextChars: result.metrics.contextChars, reduction: `${Math.round((1 - result.metrics.contextChars / fullSourceText.length) * 100)}%`, metrics: result.metrics }, null, 2));
