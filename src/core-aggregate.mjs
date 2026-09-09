import { buildIndex } from './block-index.mjs';

export function aggregateCoreBlocks(index) {
  const byRoot = new Map();
  for (const block of index.blocks) {
    const list = byRoot.get(block.root_id) ?? [];
    list.push(block);
    byRoot.set(block.root_id, list);
  }
  const knowledge = [];
  const sources = [];
  for (const [rootId, blocks] of byRoot) {
    const core = blocks.filter((block) => /^#+\s*(摘要|核心知识点|术语表)/u.test(block.text) || block.type === 'p');
    if (!core.length) continue;
    const sourceId = core.find((block) => block.source_id)?.source_id ?? `doc-${rootId}`;
    const text = core.map((block) => block.text).join('\n');
    const blockIds = core.map((block) => block.block_id);
    const titleBlock = core.find((block) => /组件作用|主要作用|用于显示文本/u.test(block.text));
    const representative = titleBlock ?? core.find((block) => /核心知识点|摘要/u.test(block.text)) ?? core[0];
    sources.push({ source_id: sourceId, source_type: 'siyuan-document', title: representative.title ?? sourceId, locator_type: 'block_id', uri: null, trust: 'medium' });
    const evidence = core.map((block) => ({ source_id: sourceId, locator: `block:${block.block_id}`, quote: block.text.slice(0, 240) }));
    knowledge.push({ knowledge_id: `doc-core-${rootId}`, title: representative.title ?? `文档 ${rootId}`, summary: text.slice(0, 400), body: text, topic: representative.path ?? '思源', status: 'active', source_ids: [sourceId], relations: [], evidence, doc_id: representative.doc_id, root_id: rootId, block_ids: blockIds });
  }
  return { knowledge, sources, aliases: index.aliases ?? [] };
}
