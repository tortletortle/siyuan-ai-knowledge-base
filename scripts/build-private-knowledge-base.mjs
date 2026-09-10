import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [input, outputDir] = process.argv.slice(2);
if (!input || !outputDir) throw new Error('usage: node scripts/build-private-knowledge-base.mjs <real-index.json> <output-dir>');

const index = JSON.parse(await readFile(resolve(input), 'utf8'));
const roots = new Map();
for (const block of index.blocks ?? []) {
  const list = roots.get(block.root_id) ?? [];
  list.push(block);
  roots.set(block.root_id, list);
}

function parseKnowledgePoint(text) {
  const match = text.match(/^\s*\d+\.\s*([^：:]+)[：:]\s*(.+)$/us);
  if (!match) return null;
  return { title: match[1].trim(), definition: match[2].trim() };
}

function categoryFor(title, definition) {
  const text = `${title} ${definition}`;
  if (/方法|调用|getComponent|convert|获取|设置|配置|清理|播放/u.test(text)) return 'usage';
  if (/属性|参数|文件|组成|构成|规则/u.test(text)) return 'property';
  if (/区别|优势|原理|作用|应用|场景|特点/u.test(text)) return 'concept';
  return 'concept';
}

function extractDocument(blocks) {
  const ordered = [...blocks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const sourceId = ordered.find((block) => block.source_id)?.source_id ?? null;
  const title = ordered.find((block) => block.type === 'h' && /^##\s+[^#]/u.test(block.text))?.text.replace(/^#+\s*/u, '').trim() ?? ordered[0]?.title ?? blocks[0]?.root_id;
  let inCore = false;
  const points = [];
  for (const block of ordered) {
    if (block.type === 'h' && /^##\s*核心知识点\s*$/u.test(block.text)) { inCore = true; continue; }
    if (inCore && block.type === 'h' && /^##\s*(术语表|卡片|测验|课程导航)\s*$/u.test(block.text)) break;
    if (!inCore || !['p', 'i'].includes(block.type)) continue;
    const parsed = parseKnowledgePoint(block.text);
    if (!parsed) continue;
    points.push({ block, ...parsed });
  }
  return { sourceId, title, points };
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
