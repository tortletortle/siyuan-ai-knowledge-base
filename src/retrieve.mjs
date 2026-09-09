const STOP_WORDS = new Set(['什么', '如何', '怎么', '哪些', '请问', '一下', '需要', '了解', '这个', '那个', '前要', '之前', '有什么', '完全', '没有', '出现在', '课程', '里的', '这', '个']);

function normalize(text) { return String(text).toLowerCase().replace(/\s+/g, ' '); }
function aliasTerms(text, aliases = []) {
  const value = normalize(text);
  const matched = [];
  for (const entry of aliases) {
    const terms = [entry.canonical, ...(entry.aliases ?? [])];
    if (terms.some((term) => value.includes(normalize(term)))) matched.push(entry.canonical);
  }
  return matched;
}
function aliasVariants(text, aliases = []) { return aliasTerms(text, aliases).flatMap((canonical) => { const entry = aliases.find((item) => item.canonical === canonical); return [canonical, ...(entry?.aliases ?? [])]; }); }
function terms(text, aliases = []) {
  const normalized = normalize(text).replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  const aliasMatches = aliasTerms(text, aliases);
  const expanded = aliasMatches.flatMap((canonical) => [canonical, ...aliases.filter((entry) => entry.canonical === canonical).flatMap((entry) => entry.aliases ?? [])]);
  const bigrams = [];
  for (const word of words) if (/^[\u3400-\u9fff]+$/u.test(word) && word.length > 1) for (let i = 0; i < word.length - 1; i += 1) bigrams.push(word.slice(i, i + 2));
  return [...new Set([...words, ...bigrams, ...expanded.flatMap((value) => normalize(value).split(/\s+/))].filter((term) => !STOP_WORDS.has(term)))];
}
export function detectIntent(query) {
  if (/前置|之前|先学|基础|依赖|前.*需要/u.test(query)) return 'prerequisite';
  if (/区别|对比|不同|差异/u.test(query)) return 'contrast';
  if (/用于|应用|场景|怎么用|如何设计/u.test(query)) return 'application';
  if (/来源|依据|哪一页|哪一节|时间戳|证据/u.test(query)) return 'evidence';
  return 'definition';
}
function score(item, queryTerms, aliases) {
  const titleTerms = new Set(terms(item.title, aliases));
  const topicTerms = new Set(terms(item.topic, aliases));
  const aliasField = new Set(terms((item.aliases ?? []).join(' '), aliases));
  const textTerms = new Set(terms(`${item.summary} ${item.body}`, aliases));
  let points = 0;
  const matches = [];
  for (const term of queryTerms) {
    if (titleTerms.has(term)) { points += 8; matches.push({ term, field: 'title' }); }
    else if (aliasField.has(term)) { points += 5; matches.push({ term, field: 'alias' }); }
    else if (topicTerms.has(term)) { points += 3; matches.push({ term, field: 'topic' }); }
    else if (textTerms.has(term)) { points += 1; matches.push({ term, field: 'text' }); }
  }
  return { points, matches };
}
function allowedRelationTypes(intent) { if (intent === 'prerequisite') return new Set(['prerequisite_of']); if (intent === 'contrast') return new Set(['contrasts_with']); if (intent === 'application') return new Set(['applies_to']); return new Set(); }
function inScope(item, options) { return (!options.courseId || item.course_id === options.courseId) && (!options.topicPrefix || item.topic?.startsWith(options.topicPrefix)); }

export function retrieve({ knowledge, sources, aliases = [] }, query, options = {}) {
  const activeOnly = options.activeOnly ?? true;
  const intent = options.intent ?? detectIntent(query);
  const mode = options.mode ?? (intent === 'evidence' ? 'evidence' : 'summary');
  const queryTerms = terms(query, aliases);
  const queryAliases = aliasVariants(query, aliases);
  const candidates = knowledge.filter((item) => (!activeOnly || item.status === 'active') && inScope(item, options));
  const ranked = candidates.map((item) => { const result = score(item, [...queryTerms, ...queryAliases], aliases); return { item, score: result.points, matches: result.matches, alias_hits: aliasTerms(`${item.title} ${item.summary} ${item.body}`, aliases) }; })
    .filter(({ score: itemScore, matches }) => itemScore >= (options.minScore ?? (queryTerms.length >= 3 ? 3 : 2)) && (options.minScore !== undefined || matches.some((match) => match.field === 'title' || match.field === 'alias') || itemScore >= 3))
    .sort((a, b) => b.score - a.score || b.matches.filter((match) => match.field === 'title').length - a.matches.filter((match) => match.field === 'title').length || b.matches.filter((match) => match.field === 'alias').length - a.matches.filter((match) => match.field === 'alias').length || a.item.title.localeCompare(b.item.title) || a.item.knowledge_id.localeCompare(b.item.knowledge_id));
  const directLimit = options.limit ?? (intent === 'prerequisite' ? 1 : 2);
  const direct = ranked.slice(0, directLimit);
  const directIds = new Set(direct.map(({ item }) => item.knowledge_id));
  const byId = new Map(knowledge.map((item) => [item.knowledge_id, item]));
  const relationTypes = allowedRelationTypes(intent);
  const neighbors = [];
  for (const { item } of direct) for (const sourceItem of knowledge) for (const relation of sourceItem.relations ?? []) {
    const targetItem = byId.get(relation.target);
    const isReverse = intent === 'prerequisite' && relation.type === 'prerequisite_of' && relation.target === item.knowledge_id;
    const isForward = relationTypes.has(relation.type) && sourceItem.knowledge_id === item.knowledge_id;
    const neighbor = isReverse ? sourceItem : (isForward ? targetItem : undefined);
    if (neighbor && neighbor.status === 'active' && inScope(neighbor, options) && !directIds.has(neighbor.knowledge_id)) neighbors.push({ item: neighbor, via: { from: sourceItem.knowledge_id, type: relation.type, to: relation.target } });
  }
  const uniqueNeighbors = [...new Map(neighbors.map((entry) => [entry.item.knowledge_id, entry])).values()].slice(0, options.neighborLimit ?? 2);
  const allItems = [...direct.map(({ item, score: itemScore, matches, alias_hits }) => ({ item, score: itemScore, matches, alias_hits, match: 'direct' })), ...uniqueNeighbors.map(({ item, via }) => ({ item, via, match: 'relation' }))];
  const sourceIds = new Set(allItems.flatMap(({ item }) => item.source_ids ?? []));
  const sourceMap = new Map(sources.map((source) => [source.source_id, source]));
  const evidence = allItems.flatMap(({ item }) => (item.evidence ?? []).map((entry) => ({ ...entry, knowledge_id: item.knowledge_id, source: sourceMap.get(entry.source_id) }))).filter((entry) => sourceIds.has(entry.source_id));
  const selectedEvidence = mode === 'evidence' ? [...new Map(evidence.map((entry) => [`${entry.source_id}:${entry.locator}`, entry])).values()] : [];
  const context = [`问题：${query}`, `意图：${intent}；模式：${mode}`, `直接命中：${direct.length} 条；关系扩展：${uniqueNeighbors.length} 条。`, ...allItems.map(({ item, match, via }) => `${match === 'direct' ? '[直接]' : `[关系:${via.type}]`} ${item.title}\n摘要：${item.summary}${mode !== 'summary' ? `\n正文：${item.body}` : ''}`), ...(selectedEvidence.length ? ['来源证据：', ...selectedEvidence.map((entry) => `- ${entry.source?.title ?? entry.source_id}（${entry.locator}）：${entry.quote}`)] : [])].join('\n');
  const directOutput = direct.map((entry) => ({ ...entry, locator: { doc_id: entry.item.doc_id ?? null, root_id: entry.item.root_id ?? null, block_id: entry.item.block_id ?? null } }));
  return { query, intent, mode, queryTerms, answerability: direct.length ? 'supported' : 'insufficient_evidence', direct: directOutput, neighbors: uniqueNeighbors, evidence: selectedEvidence, context, metrics: { directCount: direct.length, neighborCount: uniqueNeighbors.length, sourceCount: sourceIds.size, contextChars: context.length, approximateTokens: Math.ceil(context.length / 2) } };
}
