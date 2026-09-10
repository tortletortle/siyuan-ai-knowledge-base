import { createHash } from 'node:crypto';

const NON_CONTENT_TYPES = new Set(['d', 'l', 'root']);

/**
 * 解析思源 IAL（块属性）字符串，例如：
 * '{: id="20240101-abc" custom-kb-exclude="true" style="color: red;"}'
 * 返回 { 'custom-kb-exclude': 'true', style: 'color: red;', ... }。
 * IAL 是“显示与知识”之间的机器通道：人眼无感，提取器精确可读。
 */
export function parseIAL(ial) {
  if (!ial || typeof ial !== 'string') return {};
  const attrs = {};
  const pattern = /([A-Za-z0-9_-]+)="((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = pattern.exec(ial)) !== null) {
    attrs[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return attrs;
}

function blockText(block) {
  const content = String(block.content ?? '').trim();
  return content || String(block.markdown ?? '').trim();
}

function isExcludedTitle(block) {
  const text = blockText(block);
  return /^(?:#{1,6}\s*)?(?:卡片|测验)\s*$/u.test(text);
}

function hasExcludedAncestor(block, byId, isExcluded) {
  const visited = new Set();
  let current = block;
  while (current?.parent_id && !visited.has(current.parent_id)) {
    visited.add(current.parent_id);
    current = byId.get(current.parent_id);
    if (!current) break;
    if (isExcluded(current)) return true;
  }
  return false;
}

export function normalizeBlocks({ documents = [], blocks = [] }) {
  const docs = new Map(documents.map((doc) => [doc.root_id ?? doc.id, doc]));
  const byId = new Map(blocks.map((block) => [block.id, block]));
  // IAL 解析带缓存：同一索引构建过程中每个块只解析一次。
  const ialCache = new Map();
  const attrsOf = (block) => {
    if (!ialCache.has(block.id)) ialCache.set(block.id, parseIAL(block.ial));
    return ialCache.get(block.id);
  };
  const selfExcluded = (block) => attrsOf(block)['custom-kb-exclude'] === 'true';
  const selfIncluded = (block) => attrsOf(block)['custom-kb-include'] === 'true';
  // 标题排除是兜底启发式，IAL 纸条是精确指令。优先级见 KB_CONTRACT.md。
  const excludedByTitleOrIAL = (block) => isExcludedTitle(block) || selfExcluded(block);
  return blocks
    .filter((block) => {
      if (NON_CONTENT_TYPES.has(block.type)) return false;
      if (!blockText(block)) return false;
      if (selfExcluded(block)) return false; // 纸条排除 > 一切（含纳入纸条）：宁缺毋滥
      if (selfIncluded(block)) return true; // 纸条纳入 > 标题排除：把排除区里的金子救回来
      if (isExcludedTitle(block)) return false;
      if (hasExcludedAncestor(block, byId, excludedByTitleOrIAL)) return false;
      return true;
    })
    .map((block, index) => {
      const doc = docs.get(block.root_id) ?? {};
      const text = blockText(block);
      const attrs = attrsOf(block);
      const kbTopic = attrs['custom-kb-topic']?.trim();
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
        ial: block.ial ?? null,
        // 机读通道：主题覆盖与入库状态，不改变正文显示。
        kb_topic: kbTopic || null,
        kb_status: attrs['custom-kb-status']?.trim() || null
      };
    });
}

export function buildIndex(snapshot) {
  const blocks = normalizeBlocks(snapshot);
  return { schema_version: 1, generated_at: new Date().toISOString(), block_count: blocks.length, blocks };
}

function normalize(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim(); }
function extractLinks(text) { return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]); }
