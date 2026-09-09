import { createHash } from 'node:crypto';

const NON_CONTENT_TYPES = new Set(['d', 'l', 'root']);

export function normalizeBlocks({ documents = [], blocks = [] }) {
  const docs = new Map(documents.map((doc) => [doc.root_id ?? doc.id, doc]));
  return blocks
    .filter((block) => !NON_CONTENT_TYPES.has(block.type) && String(block.content ?? block.markdown ?? '').trim())
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

export function buildIndex(snapshot) {
  const blocks = normalizeBlocks(snapshot);
  return { schema_version: 1, generated_at: new Date().toISOString(), block_count: blocks.length, blocks };
}
function normalize(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim(); }
function extractLinks(text) { return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]); }
