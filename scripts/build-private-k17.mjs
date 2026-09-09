import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const out = resolve(process.argv.find((arg) => arg.startsWith('--out='))?.slice(6) ?? 'C:/temp/knowledge-poc-private/k17');
if (!args.length) throw new Error('usage: node scripts/build-private-k17.mjs --out=<dir> <note.md> ...');
const knowledge = [];
const sources = [];
const manifest = [];
for (const notePath of args) {
  const note = resolve(notePath);
  const text = await readFile(note, 'utf8');
  const sourceId = `k17-${createHash('sha256').update(note).digest('hex').slice(0, 12)}`;
  const title = basename(note, '.md');
  const transcript = join(dirname(note), `${title}.transcript.txt`);
  const courseId = title.includes('009') ? 'k17-coordinate' : title.includes('014') ? 'k17-label' : 'k17-spine';
  sources.push({ source_id: sourceId, source_type: 'video-transcript', title, course_id: courseId, locator_type: 'note-section', trust: 'medium' });
  const courseAliases = courseId === 'k17-spine' ? [{ canonical: 'SPINE', aliases: ['骨骼动画', 'SkeletonData', 'animation'] }] : courseId === 'k17-label' ? [{ canonical: 'Label', aliases: ['CC Label', 'lineHeight', '行高', '行间距', 'anchorPoint', '锚点'] }] : [{ canonical: '坐标转换', aliases: ['世界坐标', '节点坐标', 'convertTouchToNodeSpaceAR', 'convertToNodeSpaceAR'] }];
  manifest.push({ logical_id: sourceId, title, note_file_name: basename(note), transcript_file_name: basename(transcript), content_hash: createHash('sha256').update(text).digest('hex') });
  const section = text.match(/## 核心知识点([\s\S]*?)(?=\n## 术语表|\n## 卡片|$)/)?.[1] ?? '';
  const items = [...section.matchAll(/(?:^|\n)\s*(\d+)\.\s*([^：:]+)[：:]\s*([^\n]+)/g)];
  for (const match of items) {
    const id = `${sourceId}-k${match[1]}`;
    const itemText = `${match[2]}：${match[3]}`.trim();
    knowledge.push({ knowledge_id: id, title: `${title}｜${match[2].trim()}`, summary: itemText, body: itemText, topic: `K17/${title}`, course_id: courseId, aliases: courseAliases.flatMap((entry) => entry.aliases), status: 'active', source_ids: [sourceId], relations: [], evidence: [{ source_id: sourceId, locator: `note core knowledge ${match[1]}`, quote: itemText.slice(0, 240) }] });
  }
}
const queries = [];
for (const item of knowledge.slice(0, 30)) queries.push({ id: `exact-${item.knowledge_id}`, query: item.title.split('｜').at(-1), expected_ids: [item.knowledge_id], expected_answerability: 'supported', requires_evidence: true, options: { mode: 'evidence', limit: 3 }, split: 'private-test', tags: ['exact'] });
queries.push({ id: 'out-of-domain', query: '量子计算纠错', expected_ids: [], expected_answerability: 'insufficient_evidence', split: 'private-test', tags: ['negative'] });
await mkdir(out, { recursive: true });
await writeFile(join(out, 'knowledge.json'), JSON.stringify(knowledge, null, 2), 'utf8');
await writeFile(join(out, 'sources.json'), JSON.stringify(sources, null, 2), 'utf8');
await writeFile(join(out, 'eval-cases.json'), JSON.stringify(queries, null, 2), 'utf8');
await writeFile(join(out, 'manifest.json'), JSON.stringify({ dataset_version: 'k17-v1', generated_at: new Date().toISOString(), lessons: manifest, counts: { knowledge: knowledge.length, sources: sources.length, cases: queries.length } }, null, 2), 'utf8');
console.log(JSON.stringify({ out, counts: { knowledge: knowledge.length, sources: sources.length, cases: queries.length }, note_file_names: manifest.map((item) => item.note_file_name) }, null, 2));
