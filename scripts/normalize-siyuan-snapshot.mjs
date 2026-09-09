import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildIndex } from '../src/block-index.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node scripts/normalize-siyuan-snapshot.mjs <snapshot.json> <index.json>');
const snapshot = JSON.parse(await readFile(resolve(input), 'utf8'));
const index = buildIndex(snapshot);
await writeFile(resolve(output), JSON.stringify(index, null, 2), 'utf8');
console.log(JSON.stringify({ output: resolve(output), block_count: index.block_count }, null, 2));
