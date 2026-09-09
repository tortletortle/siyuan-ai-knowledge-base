import { createHash } from 'node:crypto';

const NON_CONTENT_TYPES = new Set(['d', 'l', 'root']);

function hasExcludedAncestor(block, byId) {
  let current = block;
  for (let i = 0; i < 20 && current?.parent_id; i += 1) {
    current = byId.get(current.parent_id);
    if (!current) break;
    const text = String(current.content ?? current.markdown ?? '').trim();
    if (current.type === 'h' && (/^#{1,6}\s*(卡片|测验)\s*$/u.test(text) || /^(卡片|测验)$/u.test(text))) return true;
  }
  return false;
}

export function normalizeBlocks({ documents = [], blocks = [] }) {
  const docs = new Map(documents.map((doc) => [doc.root_id ?? doc.id, doc]));
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return blocks
    .filter((block) => !NON_CONTENT_TYPES.has(block.type) && !isExcludedSection(block) && !hasExcludedAncestor(block, byId) && String(block.content ?? block.markdown ?? '').trim())
    .map((block, index) => {
      const doc = docs.get(block.root_id) ?? {};
      const text = String(block.markdown ?? block.content ?? '').trim();
      return {
        block_id: block.id,
        doc_id: doc.id ?? block.root_id,
        root_id: block.root_id,
        parent_id: block.parent_id ?? null,
        type: block.type ?? null,
        subtype: block.subtype ?? null,
        position: block.position ?? index,
        path: doc.hpath ?? null,
        title: doc.title ?? null,
        source_id: block.source_id ?? doc.source_id ?? null,
        text,
        text_normalized: normalize(text),
        content_hash: createHash('sha256').update(text).digest('hex'),
        tags: block.tags ?? [],
        links: extractLinks(text),
        ial: block.ial ?? null
      };
    });
}

function isExcludedSection(block) {
  const text = String(block.content ?? block.markdown ?? '').trim();
  return block.type === 'h' && /^#{1,6}\s*(卡片|测验)\s*$/u.test(text);
}

export function buildIndex(snapshot) {
  const blocks = normalizeBlocks(snapshot);
  return { schema_version: 1, generated_at: new Date().toISOString(), block_count: blocks.length, blocks };
}
function normalize(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim(); }
function extractLinks(text) { return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]); }
