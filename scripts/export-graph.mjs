import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildGraph, toMermaid, toMOC } from '../src/graph.mjs';

const [indexPath, outDir] = process.argv.slice(2);
if (!indexPath || !outDir) throw new Error('usage: node scripts/export-graph.mjs <index.json> <out-dir>');
const index = JSON.parse(await readFile(resolve(indexPath), 'utf8'));
const graph = buildGraph(index.blocks ?? []);
const target = resolve(outDir);
await mkdir(target, { recursive: true });
await writeFile(`${target}/graph.json`, JSON.stringify(graph, null, 2), 'utf8');
await writeFile(`${target}/graph.md`, `# 关系图\n\n\`\`\`mermaid\n${toMermaid(graph)}\n\`\`\`\n`, 'utf8');
await writeFile(`${target}/moc.md`, toMOC(graph), 'utf8');
console.log(JSON.stringify({ out: target, ...graph.stats }, null, 2));
