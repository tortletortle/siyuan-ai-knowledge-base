import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const API = process.env.SIYUAN_API ?? 'http://127.0.0.1:6806';
const TOKEN_FILE = resolve(process.env.SIYUAN_TOKEN_FILE ?? 'C:/Users/tortl/AI/tools/siyuan/token.txt');
const NOTEBOOK = process.env.SIYUAN_NOTEBOOK ?? 'AI学习笔记';
const SAMPLE_IDS = new Set([
  'src-12b60e80b3f4',
  'src-08fb3551228d',
  'src-0ede861fcfaf'
]);

function quote(value) { return String(value).replaceAll("'", "''"); }
function assertLoopback() {
  const url = new URL(API);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || (url.port || '80') !== '6806') {
    throw new Error(`refusing non-local SiYuan API: ${API}`);
  }
}
async function token() {
  const value = (await readFile(TOKEN_FILE, 'utf8')).trim();
  if (!value) throw new Error(`token file is empty: ${TOKEN_FILE}`);
  return value;
}
async function api(path, payload, auth) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Token ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  const data = await response.json();
  if (data.code !== 0) throw new Error(`${path} SiYuan code ${data.code}`);
  return data.data ?? {};
}
async function sql(auth, stmt) { return await api('/api/query/sql', { stmt }, auth) || []; }
function extractSourceIds(text) { return [...new Set(String(text).matchAll(/v2n-source-id\s*:\s*(src-[0-9a-f]+)/gi))].map((match) => match[1]); }
function questionIds(blocks) {
  return blocks.filter((block) => block.type === 'i' && /(?:^|\n)Q\s*[:：]/i.test(block.content ?? '')).map((block) => block.id);
}
function visibleLinks(blocks) {
  return blocks.flatMap((block) => [...String(block.markdown ?? block.content ?? '').matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => ({ block_id: block.id, target: match[1] })));
}

assertLoopback();
const auth = await token();
const notebooks = await api('/api/notebook/lsNotebooks', {}, auth);
const notebook = (notebooks.notebooks ?? []).find((item) => item.name === NOTEBOOK && !item.closed);
if (!notebook) throw new Error(`notebook not found: ${NOTEBOOK}`);
const box = quote(notebook.id);
const docs = await sql(auth, `SELECT id,root_id,hpath,path FROM blocks WHERE box='${box}' AND type='d' LIMIT 20000`);
const blocks = await sql(auth, `SELECT id,root_id,parent_id,type,subtype,content,markdown FROM blocks WHERE box='${box}' LIMIT 250000`);
const byRoot = new Map();
for (const block of blocks) {
  const list = byRoot.get(block.root_id) ?? [];
  list.push(block);
  byRoot.set(block.root_id, list);
}
const records = [];
for (const doc of docs) {
  const rootBlocks = byRoot.get(doc.root_id) ?? [];
  const text = rootBlocks.map((block) => `${block.content ?? ''}\n${block.markdown ?? ''}`).join('\n');
  const sourceIds = extractSourceIds(text).filter((id) => SAMPLE_IDS.has(id));
  for (const source_id of sourceIds) {
    const links = visibleLinks(rootBlocks);
    records.push({
      source_id,
      path: doc.hpath,
      doc_id: doc.id,
      root_id: doc.root_id,
      block_count: rootBlocks.length,
      question_block_ids: questionIds(rootBlocks),
      has_visible_source_id: /\[src-[0-9a-f]+\]/i.test(doc.hpath ?? ''),
      is_empty_container: rootBlocks.filter((block) => block.id !== doc.root_id && String(block.content ?? '').trim()).length === 0,
      is_moc: /MOC|课程|章节|主题/.test(doc.hpath ?? ''),
      tags: [...new Set(rootBlocks.flatMap((block) => String(block.markdown ?? block.content ?? '').match(/#[^#\s]+#/g) ?? []))],
      links,
      block_ids: rootBlocks.map((block) => block.id)
    });
  }
}
const report = {
  generated_at: new Date().toISOString(),
  policy: 'read-only live audit; no token or full note text is written',
  notebook: NOTEBOOK,
  sample_ids: [...SAMPLE_IDS],
  records,
  summary: Object.fromEntries([...SAMPLE_IDS].map((id) => [id, records.filter((record) => record.source_id === id).length]))
};
const output = process.env.SIYUAN_AUDIT_OUTPUT;
if (output) await writeFile(resolve(output), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ generated_at: report.generated_at, notebook: NOTEBOOK, record_count: records.length, summary: report.summary, output: output ? resolve(output) : null }, null, 2));
