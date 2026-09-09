import { readFile, writeFile } from 'node:fs/promises';
import { buildIndex } from '../src/block-index.mjs';
import { blockIndexToDataset } from '../src/block-dataset.mjs';

const [input, indexOut, datasetOut] = process.argv.slice(2);
if (!input || !indexOut || !datasetOut) throw new Error('usage: node scripts/build-real-siyuan-index.mjs <raw.json> <index.json> <dataset.json>');
const raw = JSON.parse(await readFile(input, 'utf8'));
const byRoot = new Map();
for (const block of raw.blocks ?? []) { const list = byRoot.get(block.root_id) ?? []; list.push(block); byRoot.set(block.root_id, list); }
const targetIds = ['src-12b60e80b3f4', 'src-08fb3551228d', 'src-0ede861fcfaf'];
const selected = [];
for (const sourceId of targetIds) {
  const candidates = [];
  for (const [rootId, blocks] of byRoot) {
    const text = blocks.map((b) => `${b.content ?? ''}\n${b.markdown ?? ''}`).join('\n');
    if (!text.includes(sourceId)) continue;
    const body = blocks.filter((b) => !['d', 'l'].includes(b.type) && String(b.content ?? b.markdown ?? '').trim()).map((b) => String(b.content ?? b.markdown ?? '')).join(' ');
    candidates.push({ rootId, blocks, bodyLength: body.length, path: text.match(/v2n-source-path:\s*([^\n]+)/)?.[1] ?? null });
  }
  const winner = candidates.sort((a, b) => b.bodyLength - a.bodyLength)[0];
  if (!winner) throw new Error(`sample source not found: ${sourceId}`);
  selected.push({ sourceId, ...winner });
}
const documents = selected.map(({ sourceId, rootId, path }) => ({ id: rootId, root_id: rootId, hpath: path, title: path?.split('/').at(-1) ?? sourceId, source_id: sourceId }));
const blocks = selected.flatMap(({ sourceId, rootId, blocks: rootBlocks }) => rootBlocks.map((block) => ({ ...block, source_id: sourceId, root_id: rootId })));
const index = buildIndex({ documents, blocks });
const dataset = blockIndexToDataset(index);
await writeFile(indexOut, JSON.stringify(index, null, 2), 'utf8');
await writeFile(datasetOut, JSON.stringify(dataset, null, 2), 'utf8');
console.log(JSON.stringify({ selected: selected.map((item) => ({ source_id: item.sourceId, root_id: item.rootId, block_count: item.blocks.length, body_length: item.bodyLength })), index_blocks: index.block_count, knowledge: dataset.knowledge.length }, null, 2));
