const STOP_WORDS = new Set(['什么', '如何', '怎么', '哪些', '请问', '一下', '需要', '了解', '这个', '那个', '前要', '之前', '有什么', '完全', '没有', '出现在', '课程', '里的', '这', '个']);
const ALIASES = new Map([
  ['fsm', '有限状态机'],
  ['finite state machine', '有限状态机'],
  ['sequential logic', '时序逻辑'],
  ['顺序逻辑', '时序逻辑'],
  ['combinational logic', '组合逻辑'],
  ['counter', '计数器']
]);

function normalizeAliases(text) {
  let result = String(text).toLowerCase();
  for (const [alias, canonical] of ALIASES) result = result.replaceAll(alias, ` ${canonical} `);
  return result;
}

function terms(text) {
  const normalized = normalizeAliases(text).replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const bigrams = [];
  for (const word of words) {
    if (/^[\u3400-\u9fff]+$/u.test(word) && word.length > 1) {
      for (let i = 0; i < word.length - 1; i += 1) bigrams.push(word.slice(i, i + 2));
    }
  }
  return [...new Set([...words, ...bigrams].filter((term) => !STOP_WORDS.has(term)))];
}

export function detectIntent(query) {
  if (/前置|之前|先学|基础|依赖|前.*需要/u.test(query)) return 'prerequisite';
  if (/区别|对比|不同|差异/u.test(query)) return 'contrast';
  if (/用于|应用|场景|怎么用|如何设计/u.test(query)) return 'application';
  if (/来源|依据|哪一页|哪一节|时间戳|证据/u.test(query)) return 'evidence';
  return 'definition';
}

function score(item, queryTerms) {
  const titleTerms = new Set(terms(item.title));
  const textTerms = new Set(terms(`${item.summary} ${item.body} ${item.topic} ${(item.aliases ?? []).join(' ')}`));
  let points = 0;
  for (const term of queryTerms) {
    if (titleTerms.has(term)) points += 5;
    else if (textTerms.has(term)) points += 1;
  }
  return points;
}

function allowedRelationTypes(intent) {
  if (intent === 'prerequisite') return new Set(['prerequisite_of']);
  if (intent === 'contrast') return new Set(['contrasts_with']);
  if (intent === 'application') return new Set(['applies_to']);
  return new Set();
}

export function retrieve({ knowledge, sources }, query, options = {}) {
  const activeOnly = options.activeOnly ?? true;
  const intent = options.intent ?? detectIntent(query);
  const mode = options.mode ?? (intent === 'evidence' ? 'evidence' : 'summary');
  const topic = options.topic;
  const candidates = knowledge.filter((item) => (!activeOnly || item.status === 'active') && (!topic || item.topic.startsWith(topic)));
  const queryTerms = terms(query);
  const ranked = candidates.map((item) => ({ item, score: score(item, queryTerms) }))
    .filter(({ score: itemScore }) => itemScore >= (options.minScore ?? (queryTerms.length >= 3 ? 3 : 2)))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  const directLimit = options.limit ?? (intent === 'prerequisite' ? 1 : 2);
  const direct = ranked.slice(0, directLimit);
  const directIds = new Set(direct.map(({ item }) => item.knowledge_id));
  const byId = new Map(knowledge.map((item) => [item.knowledge_id, item]));
  const relationTypes = allowedRelationTypes(intent);
  const neighbors = [];
  for (const { item } of direct) {
    for (const sourceItem of knowledge) {
      for (const relation of sourceItem.relations ?? []) {
        const targetItem = byId.get(relation.target);
        const isReversePrerequisite = intent === 'prerequisite' && relation.type === 'prerequisite_of' && relation.target === item.knowledge_id;
        const isForwardMatch = relationTypes.has(relation.type) && sourceItem.knowledge_id === item.knowledge_id;
        const neighbor = isReversePrerequisite ? sourceItem : (isForwardMatch ? targetItem : undefined);
        if (neighbor && neighbor.status === 'active' && !directIds.has(neighbor.knowledge_id)) {
          neighbors.push({ item: neighbor, via: { from: sourceItem.knowledge_id, type: relation.type, to: relation.target } });
        }
      }
    }
  }
  const uniqueNeighbors = [...new Map(neighbors.map((entry) => [entry.item.knowledge_id, entry])).values()].slice(0, options.neighborLimit ?? 2);
  const allItems = [...direct.map(({ item, score: itemScore }) => ({ item, score: itemScore, match: 'direct' })), ...uniqueNeighbors.map(({ item, via }) => ({ item, via, match: 'relation' }))];
  const sourceIds = new Set(allItems.flatMap(({ item }) => item.source_ids ?? []));
  const sourceMap = new Map(sources.map((source) => [source.source_id, source]));
  const evidence = allItems.flatMap(({ item }) => (item.evidence ?? []).map((entry) => ({ ...entry, knowledge_id: item.knowledge_id, source: sourceMap.get(entry.source_id) }))).filter((entry) => sourceIds.has(entry.source_id));
  const selectedEvidence = mode === 'evidence' ? [...new Map(evidence.map((entry) => [`${entry.source_id}:${entry.locator}`, entry])).values()] : [];
  const context = [
    `问题：${query}`,
    `意图：${intent}；模式：${mode}`,
    `直接命中：${direct.length} 条；关系扩展：${uniqueNeighbors.length} 条。`,
    ...allItems.map(({ item, match, via }) => `${match === 'direct' ? '[直接]' : `[关系:${via.type}]`} ${item.title}\n摘要：${item.summary}${mode !== 'summary' ? `\n正文：${item.body}` : ''}`),
    ...(selectedEvidence.length ? ['来源证据：', ...selectedEvidence.map((entry) => `- ${entry.source?.title ?? entry.source_id}（${entry.locator}）：${entry.quote}`)] : [])
  ].join('\n');
  return {
    query, intent, mode, queryTerms,
    answerability: direct.length ? 'supported' : 'insufficient_evidence',
    direct, neighbors: uniqueNeighbors, evidence: selectedEvidence, context,
    metrics: { directCount: direct.length, neighborCount: uniqueNeighbors.length, sourceCount: sourceIds.size, contextChars: context.length, approximateTokens: Math.ceil(context.length / 2) }
  };
}
