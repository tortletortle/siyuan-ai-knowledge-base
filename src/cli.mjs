import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDataset } from './ingest.mjs';
import { retrieve } from './retrieve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataset = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json') });
const args = process.argv.slice(2);
const demo = args.includes('--demo');
const modeArg = args.find((arg) => arg.startsWith('--mode='));
const query = demo ? '学习状态机前需要什么' : args.filter((arg) => !arg.startsWith('--')).join(' ') || '时序逻辑是什么';
const result = retrieve(dataset, query, { mode: modeArg?.split('=')[1] });
console.log(JSON.stringify(result, null, 2));
