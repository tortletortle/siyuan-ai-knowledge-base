const STOP_WORDS = new Set(['什么', '如何', '怎么', '哪些', '请问', '一下', '需要', '了解', '这个', '那个', '前要', '之前']);

function terms(text) {
  const normalized = String(text).toLowerCase().replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const bigrams = [];
  for (const word of words) {
    if (/^[\u3400-\u9fff]+$/u.test(word) && word.length > 1) {
      for (let i = 0; i < word.length - 1; i += 1) bigrams.push(word.slice(i, i + 2));
    }
  }
  return [...new Set([...words, ...bigrams].filter((term) => !STOP_WORDS.has(term)))];
}

function score(item, queryTerms) {
  const titleTerms = new Set(terms(item.title));
  const textTerms = new Set(terms(`${item.summary} ${item.body} ${item.topic}`));
  let points = 0;
  for (const term of queryTerms) {
    if (titleTerms.has(term)) points += 5;
    else if (textTerms.has(term)) points += 1;
  }
  return points;
}

export function retrieve({ knowledge, sources }, query, options = {}) {
  const activeOnly = options.activeOnly ?? true;
  const topic = options.topic;
  const candidates = knowledge.filter((item) => (!activeOnly || item.status === 'active') && (!topic || item.topic.startsWith(topic)));
  const queryTerms = terms(query);
  const ranked = candidates.map((item) => ({ item, score: score(item, queryTerms) }))
    .filter(({ score: itemScore }) => itemScore >= 2)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  const direct = ranked.slice(0, options.limit ?? 3);
  const directIds = new Set(direct.map(({ item }) => item.knowledge_id));
  const byId = new Map(knowledge.map((item) => [item.knowledge_id, item]));
  const neighbors = [];
  for (const { item } of direct) {
    for (const relation of item.relations ?? []) {
      const neighbor = byId.get(relation.target);
      if (neighbor && neighbor.status === 'active' && !directIds.has(neighbor.knowledge_id)) {
        neighbors.push({ item: neighbor, via: { from: item.knowledge_id, type: relation.type } });
      }
    }
  }
  const allItems = [...direct.map(({ item }) => ({ item, score: undefined, match: 'direct' })), ...neighbors.map(({ item, via }) => ({ item, via, match: 'relation' }))];
  const sourceIds = new Set(allItems.flatMap(({ item }) => item.source_ids ?? []));
  const sourceMap = new Map(sources.map((source) => [source.source_id, source]));
  const evidence = allItems.flatMap(({ item }) => (item.evidence ?? []).map((entry) => ({ ...entry, knowledge_id: item.knowledge_id, source: sourceMap.get(entry.source_id) }))).filter((entry) => sourceIds.has(entry.source_id));
  const context = [
    `问题：${query}`,
    `直接命中：${direct.length} 条；关系扩展：${neighbors.length} 条。`,
    ...allItems.map(({ item, match, via }) => `${match === 'direct' ? '[直接]' : `[关系:${via.type}]`} ${item.title}\n摘要：${item.summary}\n正文：${item.body}`),
    '来源证据：',
    ...evidence.map((entry) => `- ${entry.source?.title ?? entry.source_id}（${entry.locator}）：${entry.quote}`)
  ].join('\n');
  return { query, queryTerms, direct, neighbors, evidence, context, metrics: { directCount: direct.length, neighborCount: neighbors.length, sourceCount: sourceIds.size, contextChars: context.length, approximateTokens: Math.ceil(context.length / 2) } };
}
