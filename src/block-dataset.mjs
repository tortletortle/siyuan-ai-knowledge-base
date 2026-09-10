export function blockIndexToDataset(index, options = {}) {
  const sourceMap = new Map();
  const knowledge = index.blocks.map((block) => {
    const sourceId = block.source_id ?? options.defaultSourceId ?? `doc-${block.doc_id}`;
    if (!sourceMap.has(sourceId)) sourceMap.set(sourceId, { source_id: sourceId, source_type: 'siyuan-block', title: block.title ?? block.path ?? sourceId, locator_type: 'block_id', uri: null, trust: 'medium' });
    return {
      knowledge_id: `block-${block.block_id}`,
      title: block.title ? `${block.title}｜${block.text.slice(0, 80)}` : block.text.slice(0, 100),
      summary: block.text.slice(0, 240),
      body: block.text,
      topic: block.kb_topic ?? block.path ?? '思源',
      course_id: options.courseId,
      status: options.status ?? 'active',
      source_ids: [sourceId],
      relations: [],
      evidence: [{ source_id: sourceId, locator: `block:${block.block_id}`, quote: block.text.slice(0, 240) }],
      doc_id: block.doc_id,
      root_id: block.root_id,
      block_id: block.block_id,
      parent_id: block.parent_id,
      aliases: options.aliases ?? [],
      links: block.links ?? []
    };
  });
  return { knowledge, sources: [...sourceMap.values()], aliases: options.aliases ?? [] };
}
