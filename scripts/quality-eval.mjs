import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import { loadDataset } from '../src/ingest.mjs';
import { retrieve } from '../src/retrieve.mjs';
import { evaluateQueries } from '../src/quality.mjs';
import { auditLesson } from '../src/learning-quality.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = resolve(args.find((arg) => arg.startsWith('--out='))?.slice(6) ?? join(root, 'out'));
const files = args.filter((arg) => !arg.startsWith('--'));
const fixture = await loadDataset({ knowledgePath: join(root, 'fixtures/knowledge.json'), sourcesPath: join(root, 'fixtures/sources.json') });
const evalCases = JSON.parse(await readFile(join(root, 'fixtures/eval-cases.json'), 'utf8'));
const retrieval = evaluateQueries(fixture, evalCases, retrieve);
const lessonAudits = [];
for (let index = 0; index < files.length; index += 4) {
  const group = files.slice(index, index + 4);
  if (group.length !== 4) continue;
  lessonAudits.push(await auditLesson(group[0], group[1], group[2], group[3]));
}
const findings = [
  ...retrieval.rows.flatMap((row) => row.suggestions.map((suggestion) => ({ issue_type: 'retrieval', severity: 'warning', target_file: 'retrieve()', target_locator: row.query, current_excerpt: suggestion, proposed_action: suggestion, confidence: 0.75, requires_confirmation: true }))),
  ...lessonAudits.flatMap((audit) => [...audit.findings, ...audit.transcript_quality.findings.map((finding) => ({ ...finding, issue_type: 'transcript.' + finding.rule_id }))])
];
const report = { generated_at: new Date().toISOString(), policy: 'read-only quality evaluation; no source or note files changed', retrieval, lessons: lessonAudits, findings, summary: { finding_count: findings.length, by_severity: Object.fromEntries(['error', 'warning', 'info'].map((severity) => [severity, findings.filter((item) => item.severity === severity).length])) } };
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'quality-report.json'), JSON.stringify(report, null, 2), 'utf8');
const markdown = `# Knowledge Quality Report\n\n- Retrieval hit@1: ${retrieval.aggregate.hit_at_1}\n- Retrieval hit@3: ${retrieval.aggregate.hit_at_3}\n- MRR: ${retrieval.aggregate.mrr.toFixed(4)}\n- Findings: ${findings.length}\n- Error / Warning / Info: ${report.summary.by_severity.error} / ${report.summary.by_severity.warning} / ${report.summary.by_severity.info}\n\n## Suggestions\n${findings.map((item) => `- [${item.severity}] ${item.issue_type}: ${item.proposed_action} (${item.target_locator})`).join('\n')}`;
await writeFile(join(outDir, 'quality-report.md'), markdown, 'utf8');
console.log(JSON.stringify({ output: outDir, summary: report.summary, retrieval: retrieval.aggregate }, null, 2));
