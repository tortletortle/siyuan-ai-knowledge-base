import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseKnowledgePoint, isHeading, categoryFor, extractCorePoints } from '../src/knowledge-extract.mjs';

const [input, outputDir] = process.argv.slice(2);
if (!input || !outputDir) throw new Error('usage: node scripts/build-private-knowledge-base.mjs <real-index.json> <output-dir>');

const index = JSON.parse(await readFile(resolve(input), 'utf8'));
const roots = new Map();
for (const block of index.blocks ?? []) {
  const list = roots.get(block.root_id) ?? [];
  list.push(block);
  roots.set(block.root_id, list);
}

function extractDocument(blocks) {
  const ordered = [...blocks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return extractCorePoints(ordered);
}

const knowledge = [];
const sources = [];
const coverage = [];
for (const [rootId, blocks] of roots) {
  const document = extractDocument(blocks);
  if (!document.points.length) continue;
  const sourceId = document.sourceId ?? `doc-${rootId}`;
  const first = blocks[0];
  sources.push({ source_id: sourceId, source_type: 'siyuan-document', title: document.title, locator_type: 'block_id', doc_id: rootId, trust: 'medium' });
  const covered = document.points.map(({ title }) => title);
  coverage.push({ root_id: rootId, source_id: sourceId, document_title: document.title, source_core_points: covered.length, candidate_count: covered.length, covered_titles: covered, missing_titles: [], excluded_sections: ['卡片', '测验', '课程导航'] });
  for (const [position, point] of document.points.entries()) {
    const category = categoryFor(point.title, point.definition);
    const id = `candidate-${point.block.block_id}`;
    const quote = point.definition;
    knowledge.push({
      knowledge_id: id,
      title: point.title,
      summary: point.definition,
      body: point.definition,
      topic: document.title,
      definition: point.definition,
      key_points: [point.definition],
      usage: category === 'usage' ? [point.definition] : [],
      pitfalls: [],
      related: [],
      category,
      status: 'candidate',
      source_ids: [sourceId],
      doc_id: point.block.doc_id,
      root_id: rootId,
      block_id: point.block.block_id,
      position,
      evidence: [{ source_id: sourceId, locator: `block:${point.block.block_id}`, block_id: point.block.block_id, quote }],
      review: { reviewed_at: null, reviewer: null, note: null }
    });
  }
}

knowledge.sort((a, b) => a.doc_id.localeCompare(b.doc_id) || a.position - b.position);
const result = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  policy: 'private candidate knowledge base derived from read-only Siyuan blocks; source text remains external',
  knowledge,
  sources,
  coverage
};

const targetDir = resolve(outputDir);
await mkdir(targetDir, { recursive: true });
await writeFile(resolve(targetDir, 'candidate-knowledge.json'), JSON.stringify(result, null, 2), 'utf8');
await writeFile(resolve(targetDir, 'coverage-report.json'), JSON.stringify({ generated_at: result.generated_at, coverage }, null, 2), 'utf8');
const markdown = ['# 首批真实思源候选知识库', '', '> 所有条目均为 candidate；原始思源内容只读，证据通过真实 block ID 定位。', ''];
for (const group of coverage) {
  markdown.push(`## ${group.document_title}`, '', `- source_id: \`${group.source_id}\``, `- root_id: \`${group.root_id}\``, `- 核心知识点：${group.source_core_points}`, `- 候选条目：${group.candidate_count}`, '');
  for (const item of knowledge.filter((entry) => entry.root_id === group.root_id)) {
    markdown.push(`### ${item.title}`, '', `- knowledge_id: \`${item.knowledge_id}\``, `- status: \`${item.status}\``, `- category: ${item.category}`, `- evidence: \`${item.evidence[0].locator}\``, '', item.definition, '');
  }
}
await writeFile(resolve(targetDir, 'candidate-knowledge.md'), `${markdown.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ output: targetDir, documents: coverage.length, knowledge: knowledge.length, all_candidate: knowledge.every((item) => item.status === 'candidate'), evidence_complete: knowledge.every((item) => item.evidence.length > 0) }, null, 2));
