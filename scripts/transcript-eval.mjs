import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { retrieve } from '../src/retrieve.mjs';

const inputFiles = process.argv.slice(2).filter((value) => !value.startsWith('--'));
if (inputFiles.length === 0) {
  console.error('usage: node scripts/transcript-eval.mjs <transcript> [<transcript> ...]');
  process.exitCode = 2;
  process.exit();
}

function idFor(value) {
  return `transcript-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}
function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}
async function makeDataset(paths) {
  const knowledge = [];
  const sources = [];
  for (const file of paths) {
    const absolute = resolve(file);
    const raw = await readFile(absolute, 'utf8');
    const sourceId = idFor(absolute);
    const title = basename(absolute).replace(/\.transcript\.txt$/i, '');
    sources.push({ source_id: sourceId, source_type: 'video-transcript', title, locator_type: 'line-range', uri: `file://${absolute}`, trust: 'medium' });
    const lines = raw.split(/\r?\n/).map(clean).filter(Boolean);
    for (let offset = 0; offset < lines.length; offset += 4) {
      const text = lines.slice(offset, offset + 4).join(' ');
      if (text.length < 20 || /没问题。?我|声音|人声|音频文件|你稍等/.test(text)) continue;
      const id = `${sourceId}-l${offset + 1}`;
      knowledge.push({
        knowledge_id: id,
        title: `${title} · 转写片段 ${offset + 1}-${Math.min(offset + 4, lines.length)}`,
        summary: text.slice(0, 180),
        body: text,
        topic: 'K17/Cocos Creator',
        status: 'active',
        source_ids: [sourceId],
        relations: [],
        evidence: [{ source_id: sourceId, locator: `lines ${offset + 1}-${Math.min(offset + 4, lines.length)}`, quote: text.slice(0, 240) }]
      });
    }
  }
  return { knowledge, sources };
}

const dataset = await makeDataset(inputFiles);
const cases = [
  { query: '局部坐标和世界坐标怎么转换？', expected: ['坐标'] },
  { query: 'Label 组件可以调整哪些文字属性？', expected: ['Label'] },
  { query: 'SPINE 骨骼动画为什么比帧动画节省资源？', expected: ['spine'] },
  { query: '完全没有出现在课程里的量子计算纠错', expected: [] }
];
const report = cases.map(({ query, expected }) => {
  const result = retrieve(dataset, query, { mode: 'evidence', limit: 5 });
  const titles = result.direct.map(({ item }) => item.title);
  const matchedExpected = expected.length === 0
    ? result.direct.length === 0
    : expected.some((term) => titles.some((title) => title.toLowerCase().includes(term.toLowerCase())));
  return {
    query,
    expected,
    matchedExpected,
    direct: result.direct.map(({ item, score }) => ({ id: item.knowledge_id, title: item.title, score })),
    evidence: result.evidence.map((entry) => ({ source_id: entry.source_id, locator: entry.locator })),
    metrics: result.metrics,
    answerability: result.answerability
  };
});
const summary = {
  files: inputFiles.map((file) => resolve(file)),
  chunks: dataset.knowledge.length,
  sources: dataset.sources.length,
  passed: report.filter((item) => item.matchedExpected).length,
  total: report.length,
  totalContextChars: report.reduce((sum, item) => sum + item.metrics.contextChars, 0),
  report
};
console.log(JSON.stringify(summary, null, 2));
