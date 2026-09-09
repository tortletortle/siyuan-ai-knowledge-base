import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';
import { evaluateQueries } from '../src/quality.mjs';
import { validateEvalCases, sha256Json } from '../src/eval-schema.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueOf = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const paths = { knowledge: valueOf('knowledge'), sources: valueOf('sources'), cases: valueOf('cases'), out: valueOf('out') };
const external = Boolean(paths.knowledge || paths.sources || paths.cases);
if (external && !(paths.knowledge && paths.sources && paths.cases)) throw new Error('external evaluation requires --knowledge, --sources, and --cases together');
const input = external ? paths : { knowledge: join(root, 'fixtures/knowledge.json'), sources: join(root, 'fixtures/sources.json'), cases: join(root, 'fixtures/eval-cases.json') };
for (const [name, file] of Object.entries(input)) {
  try { await stat(file); } catch { throw new Error(`${name} file does not exist: ${file}`); }
}
if (external && resolve(input.knowledge).startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('external dataset must be outside the public repository');
const dataset = await loadDataset({ knowledgePath: input.knowledge, sourcesPath: input.sources });
const cases = validateEvalCases(JSON.parse(await readFile(input.cases, 'utf8')), new Set(dataset.knowledge.map((item) => item.knowledge_id)));
const retrieval = evaluateQueries(dataset, cases, retrieve);
const outputDir = resolve(paths.out ?? (external ? join(dirname(input.cases), 'runs', new Date().toISOString().slice(0, 10)) : join(root, 'out')));
await mkdir(outputDir, { recursive: true });
const report = {
  generated_at: new Date().toISOString(),
  policy: 'read-only evaluation; report excludes source text and evidence quotes',
  dataset: { external, knowledge_count: dataset.knowledge.length, source_count: dataset.sources.length, hash: sha256Json({ knowledge: dataset.knowledge, sources: dataset.sources }) },
  cases: { count: cases.length, hash: sha256Json(cases) },
  retrieval,
  findings: retrieval.rows.flatMap((row) => row.suggestions.map((suggestion) => ({ id: row.id, issue_type: 'retrieval', suggestion })))
};
await writeFileSafe(join(outputDir, 'quality-report.json'), JSON.stringify(report, null, 2));
const markdown = `# Retrieval Evaluation\n\n- External dataset: ${external}\n- Knowledge items: ${dataset.knowledge.length}\n- Cases: ${cases.length}\n- Hit@1: ${retrieval.aggregate.hit_at_1}\n- Hit@3: ${retrieval.aggregate.hit_at_3}\n- MRR: ${retrieval.aggregate.mrr.toFixed(4)}\n- No-answer false-hit rate: ${retrieval.aggregate.no_answer_false_hit_rate}\n- Evidence coverage: ${retrieval.aggregate.evidence_coverage}\n\n## Failed or review cases\n${retrieval.rows.filter((row) => row.suggestions.some((item) => !item.includes('符合预期'))).map((row) => `- ${row.id}: ${row.suggestions.join('；')}`).join('\n') || '- none'}`;
await writeFileSafe(join(outputDir, 'quality-report.md'), markdown);
console.log(JSON.stringify({ output: outputDir, external, dataset: report.dataset, cases: report.cases, aggregate: retrieval.aggregate }, null, 2));
async function writeFileSafe(file, content) { const { writeFile } = await import('node:fs/promises'); await writeFile(file, content, 'utf8'); }
