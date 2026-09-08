export const STATUSES = new Set(['candidate', 'active', 'deprecated', 'archived']);
export const RELATION_TYPES = new Set(['belongs_to', 'prerequisite_of', 'contrasts_with', 'applies_to', 'supersedes']);

export function validateDataset(knowledge, sources) {
  const sourceIds = new Set(sources.map((source) => source.source_id));
  const ids = new Set();
  for (const item of knowledge) {
    if (!item.knowledge_id || ids.has(item.knowledge_id)) throw new Error(`invalid or duplicate knowledge_id: ${item.knowledge_id}`);
    ids.add(item.knowledge_id);
    if (!item.title || !item.summary || !item.body || !item.topic) throw new Error(`incomplete knowledge item: ${item.knowledge_id}`);
    if (!STATUSES.has(item.status)) throw new Error(`invalid status: ${item.status}`);
    for (const sourceId of item.source_ids ?? []) if (!sourceIds.has(sourceId)) throw new Error(`unknown source ${sourceId}`);
    for (const relation of item.relations ?? []) {
      if (!RELATION_TYPES.has(relation.type)) throw new Error(`invalid relation: ${relation.type}`);
      if (!ids.has(relation.target) && !knowledge.some((candidate) => candidate.knowledge_id === relation.target)) {
        throw new Error(`unknown relation target ${relation.target}`);
      }
    }
  }
  return true;
}
