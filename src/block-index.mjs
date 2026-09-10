import { createHash } from 'node:crypto';

const NON_CONTENT_TYPES = new Set(['d', 'l', 'root']);

/**
 * 解析思源 IAL（块属性）字符串，例如：
 * '{: id="20240101-abc" custom-kb-exclude="true" style="color: red;"}'
 * 返回 { 'custom-kb-exclude': 'true', style: 'color: red;', ... }。
 * IAL 是“显示与知识”之间的机器通道：人眼无感，提取器精确可读。
 */
/**
 * 提取思源块引用（图谱的边），支持三种真实写法：
 * 1. markdown 块引：((20240101120000-abc1234 "锚文本")) 或 ((20240101120000-abc1234))
 * 2. 块超链：[文本](siyuan://blocks/20240101120000-abc1234)
 * 3. content HTML：<span data-type="block-ref" data-id="20240101120000-abc1234">
 * 返回去重后的目标 block id 数组。[[wikilink]] 仍由 extractLinks 处理。
 */
export function extractRefs(text) {
  const value = String(text ?? '');
  const found = new Set();
  for (const match of value.matchAll(/\(\((\d[0-9A-Za-z-]{9,})[^()]*?\)\)/g)) found.add(match[1]);
  for (const match of value.matchAll(/siyuan:\/\/blocks\/([0-9A-Za-z-]+)/g)) found.add(match[1]);
  for (const match of value.matchAll(/data-type="block-ref"[^>]*?data-id="([^"]+)"/g)) found.add(match[1]);
  for (const match of value.matchAll(/data-id="([^"]+)"[^>]*?data-type="block-ref"/g)) found.add(match[1]);
  return [...found];
}

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
      // 原生别名（块标菜单 → 命名/别名）：逗号/顿号分隔，直接喂给检索加权。
      // 术语别名从此写在思源里，不再只靠 fixtures/aliases.json。
      const nativeAliases = (attrs.alias ?? '').split(/[,，、]/).map((value) => value.trim()).filter(Boolean);
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
        refs: extractRefs(text),
        ial: block.ial ?? null,
        // 机读通道：主题覆盖与入库状态，不改变正文显示。
        kb_topic: kbTopic || null,
        kb_status: attrs['custom-kb-status']?.trim() || null,
        kb_aliases: nativeAliases,
      };
    });
}

export function buildIndex(snapshot) {
  const blocks = normalizeBlocks(snapshot);
  return { schema_version: 1, generated_at: new Date().toISOString(), block_count: blocks.length, blocks };
}

function normalize(text) { return text.toLowerCase().replace(/\s+/g, ' ').trim(); }
function extractLinks(text) { return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]); }
