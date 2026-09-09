import { readFile, writeFile } from 'node:fs/promises';
import { aggregateCoreBlocks } from '../src/core-aggregate.mjs';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('usage: node scripts/aggregate-core.mjs <index.json> <dataset.json>');
const index = JSON.parse(await readFile(input, 'utf8'));
const result = aggregateCoreBlocks(index);
await writeFile(output, JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify({ output, knowledge: result.knowledge.length, sources: result.sources.length }, null, 2));
